//! Native PDF rendering smoke test. Run with the Vite server active:
//! cargo run -p feather-desktop --example pdf_smoke -- INPUT.html OUTPUT.pdf
#[path = "../src/pdf.rs"]
mod pdf;
use std::path::PathBuf;
use tauri::{Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct Fixture {
    html: String,
    output: PathBuf,
}

#[tauri::command]
fn export_payload(state: State<'_, Fixture>) -> serde_json::Value {
    println!("Export payload requested");
    serde_json::json!({ "html": state.html, "title": "From codes to proofs" })
}

#[tauri::command]
async fn export_ready(window: WebviewWindow, state: State<'_, Fixture>) -> Result<(), String> {
    println!("Page ready; generating PDF");
    match pdf::render(&window, state.output.clone()).await {
        Ok(()) => {
            println!("PDF saved: {}", state.output.display());
            window.app_handle().exit(0);
        }
        Err(error) => {
            eprintln!("{error}");
            window.app_handle().exit(1);
        }
    }
    Ok(())
}

#[tauri::command]
fn export_failed(window: WebviewWindow, message: String) {
    eprintln!("{message}");
    window.app_handle().exit(1);
}

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    assert_eq!(args.len(), 3, "Usage: pdf_smoke INPUT.html OUTPUT.pdf");
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .manage(Fixture {
            html: std::fs::read_to_string(&args[1]).unwrap(),
            output: PathBuf::from(&args[2]),
        })
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "export-smoke",
                WebviewUrl::App("pdf-export.html".into()),
            )
            .on_page_load(|_, event| println!("Page {:?}: {}", event.event(), event.url()))
            .inner_size(794.0, 1123.0)
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(60));
                eprintln!("PDF smoke test timed out");
                handle.exit(1);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            export_payload,
            export_ready,
            export_failed
        ])
        .run(context)
        .expect("Could not start PDF smoke test");
}
