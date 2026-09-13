use base64::Engine;
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

#[derive(Serialize)]
pub struct ExportPayload {
    html: String,
    title: String,
}
struct ExportJob {
    payload: Option<ExportPayload>,
    path: PathBuf,
    completion: oneshot::Sender<Result<(), String>>,
}
#[derive(Default)]
pub struct ExportState {
    jobs: Mutex<HashMap<String, ExportJob>>,
    counter: AtomicU64,
}

async fn destination(app: AppHandle, name: String) -> Result<Option<PathBuf>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .set_file_name(name)
            .blocking_save_file()
            .map(|file| file.into_path().map_err(|e| e.to_string()))
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}

fn write_pdf(bytes: &[u8], path: &Path) -> Result<String, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("The renderer did not return a PDF".into());
    }
    let mut temp = tempfile::Builder::new()
        .prefix(".feather-")
        .tempfile_in(path.parent().ok_or("Invalid destination")?)
        .map_err(|e| e.to_string())?;
    temp.write_all(bytes)
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|e| e.to_string())?;
    temp.persist(path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn export_markdown(
    app: AppHandle,
    state: State<'_, ExportState>,
    html: String,
    title: String,
) -> Result<Option<String>, String> {
    if html.len() > 64 * 1024 * 1024 {
        return Err("This rendered document is too large to export at once".into());
    }
    let Some(destination) = destination(app.clone(), format!("{title}.pdf")).await? else {
        return Ok(None);
    };
    let temporary = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = temporary.path().join("document.pdf");
    let (completion, finished) = oneshot::channel();
    let label = format!("export-{}", state.counter.fetch_add(1, Ordering::SeqCst));
    state.jobs.lock().map_err(|e| e.to_string())?.insert(
        label.clone(),
        ExportJob {
            payload: Some(ExportPayload { html, title }),
            path: path.clone(),
            completion,
        },
    );
    // This WebView only lays out the document; no preview or print window appears.
    let window =
        match WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("pdf-export.html".into()))
            .title("Preparing PDF")
            .inner_size(794.0, 1123.0)
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .build()
        {
            Ok(window) => window,
            Err(error) => {
                if let Ok(mut jobs) = state.jobs.lock() {
                    jobs.remove(&label);
                }
                return Err(error.to_string());
            }
        };
    let result = tokio::time::timeout(Duration::from_secs(90), finished).await;
    let _ = window.destroy();
    if let Ok(mut jobs) = state.jobs.lock() {
        jobs.remove(&label);
    }
    result
        .map_err(|_| "PDF generation timed out. Try exporting a smaller document.".to_string())?
        .map_err(|_| "PDF export was interrupted".to_string())??;
    tauri::async_runtime::spawn_blocking(move || {
        // Keep the temporary directory alive until the generated PDF is copied atomically.
        let _temporary = temporary;
        let mut bytes = Vec::new();
        std::fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(48 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 48 * 1024 * 1024 {
            return Err("This PDF exceeds the export limit".into());
        }
        write_pdf(&bytes, &destination).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn export_payload(
    window: WebviewWindow,
    state: State<'_, ExportState>,
) -> Result<ExportPayload, String> {
    state
        .jobs
        .lock()
        .map_err(|e| e.to_string())?
        .get_mut(window.label())
        .and_then(|job| job.payload.take())
        .ok_or("This PDF export is no longer available".into())
}

#[tauri::command]
pub async fn export_ready(
    window: WebviewWindow,
    state: State<'_, ExportState>,
) -> Result<(), String> {
    let job = state
        .jobs
        .lock()
        .map_err(|e| e.to_string())?
        .remove(window.label())
        .ok_or("This PDF export is no longer available")?;
    let result = crate::pdf::render(&window, job.path).await;
    let _ = job.completion.send(result);
    Ok(())
}

#[tauri::command]
pub fn export_failed(window: WebviewWindow, state: State<'_, ExportState>, message: String) {
    if let Ok(mut jobs) = state.jobs.lock() {
        if let Some(job) = jobs.remove(window.label()) {
            let _ = job.completion.send(Err(message));
        }
    }
}

#[tauri::command]
pub async fn save_pdf(
    app: AppHandle,
    data: String,
    name: String,
) -> Result<Option<String>, String> {
    if data.len() > 64 * 1024 * 1024 {
        return Err("This PDF exceeds the export limit".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("The compiler did not return a PDF".into());
    }
    let Some(path) = destination(app, name).await? else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || write_pdf(&bytes, &path).map(Some))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_export_preserves_existing_destination() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("paper.pdf");
        std::fs::write(&path, b"previous PDF").unwrap();
        assert!(write_pdf(b"render failed", &path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"previous PDF");
        write_pdf(b"%PDF-1.7\nupdated", &path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-1.7\nupdated");
    }
}
