use feather_core::{Document, Entry, Workspace};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct Session {
    id: u64,
    workspace: Option<Workspace>,
    watcher: Option<feather_core::watcher::FileWatcher>,
}
pub struct AppState {
    session: Arc<Mutex<Session>>,
    pub pending: Mutex<Option<PathBuf>>,
    compiling: Arc<AtomicBool>,
}
impl AppState {
    pub(crate) fn terminal_directory(
        &self,
        workspace_id: u64,
        path: &str,
    ) -> CommandResult<PathBuf> {
        let session = self.session.lock().map_err(|e| e.to_string())?;
        if session.id != workspace_id {
            return Err("The opened folder changed".into());
        }
        let directory = session
            .workspace
            .as_ref()
            .ok_or("Open a folder before starting a terminal")?
            .resolve(path)
            .map_err(|e| e.to_string())?;
        if !directory.is_dir() {
            return Err("The terminal must start in a directory".into());
        }
        Ok(directory)
    }
    pub fn new(initial: Option<PathBuf>) -> Self {
        Self {
            session: Arc::new(Mutex::new(Session {
                id: 0,
                workspace: None,
                watcher: None,
            })),
            pending: Mutex::new(initial),
            compiling: Arc::new(AtomicBool::new(false)),
        }
    }
}
type CommandResult<T> = Result<T, String>;

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn git_baseline(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
) -> CommandResult<feather_core::git::GitBaseline> {
    let workspace = scoped(&state, workspace_id, |w| Ok(w.clone())).await?;
    tauri::async_runtime::spawn_blocking(move || {
        feather_core::git::baseline(&workspace, &path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    id: u64,
    root: String,
    name: String,
    selected: Option<String>,
    watch_warning: Option<String>,
}

async fn activate(
    app: AppHandle,
    session: Arc<Mutex<Session>>,
    path: PathBuf,
) -> CommandResult<WorkspaceInfo> {
    tauri::async_runtime::spawn_blocking(move || {
        let (workspace, selected) = Workspace::open(path).map_err(|e| e.to_string())?;
        let mut session = session.lock().map_err(|e| e.to_string())?;
        session.id += 1;
        let id = session.id;
        let watcher = feather_core::watcher::watch(&workspace, move |paths| {
            let _ = app.emit("workspace-changed", (id, paths));
        });
        let watch_warning = watcher
            .as_ref()
            .err()
            .map(|e| format!("File watching is unavailable: {e}"));
        let info = WorkspaceInfo {
            id,
            root: workspace.root.to_string_lossy().into_owned(),
            name: workspace
                .root
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            selected,
            watch_warning,
        };
        session.workspace = Some(workspace);
        session.watcher = watcher.ok();
        Ok(info)
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn scoped<T: Send + 'static>(
    state: &AppState,
    workspace_id: u64,
    f: impl FnOnce(&Workspace) -> feather_core::Result<T> + Send + 'static,
) -> CommandResult<T> {
    let session = state.session.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = session.lock().map_err(|e| e.to_string())?;
        if session.id != workspace_id {
            return Err("The opened folder changed; please try again".into());
        }
        f(session.workspace.as_ref().ok_or("Open a folder first")?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn open_requested(
    app: AppHandle,
    state: State<'_, AppState>,
) -> CommandResult<Option<WorkspaceInfo>> {
    let path = state.pending.lock().map_err(|e| e.to_string())?.take();
    match path {
        Some(path) => activate(app, state.session.clone(), path).await.map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn choose_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: bool,
) -> CommandResult<Option<WorkspaceInfo>> {
    let dialog_app = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        if folder {
            dialog_app
                .dialog()
                .file()
                .set_title("Open folder in Feather")
                .blocking_pick_folder()
        } else {
            dialog_app
                .dialog()
                .file()
                .set_title("Open file in Feather")
                .blocking_pick_file()
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    match path {
        Some(path) => activate(
            app,
            state.session.clone(),
            path.into_path().map_err(|e| e.to_string())?,
        )
        .await
        .map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn list_directory(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
) -> CommandResult<Vec<Entry>> {
    scoped(&state, workspace_id, move |w| w.list(&path)).await
}
#[tauri::command]
pub async fn search_files(
    state: State<'_, AppState>,
    workspace_id: u64,
    query: String,
) -> CommandResult<feather_core::workspace::SearchResults> {
    scoped(&state, workspace_id, move |w| w.search(&query)).await
}
#[tauri::command]
pub async fn read_document(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
) -> CommandResult<Document> {
    scoped(&state, workspace_id, move |w| w.read(&path)).await
}
#[tauri::command]
pub async fn save_document(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
    contents: String,
    version: String,
) -> CommandResult<String> {
    scoped(&state, workspace_id, move |w| {
        w.save(&path, &contents, &version)
    })
    .await
}
#[tauri::command]
pub async fn create_entry(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
    directory: bool,
) -> CommandResult<()> {
    scoped(&state, workspace_id, move |w| w.create(&path, directory)).await
}
#[tauri::command]
pub async fn rename_entry(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
    destination: String,
) -> CommandResult<()> {
    scoped(&state, workspace_id, move |w| w.rename(&path, &destination)).await
}
#[tauri::command]
pub async fn duplicate_entry(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
    destination: String,
) -> CommandResult<()> {
    scoped(&state, workspace_id, move |w| {
        w.duplicate(&path, &destination)
    })
    .await
}
#[tauri::command]
pub async fn trash_entry(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
) -> CommandResult<()> {
    scoped(&state, workspace_id, move |w| w.trash(&path)).await
}
#[tauri::command]
pub async fn read_image(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
) -> CommandResult<String> {
    scoped(&state, workspace_id, move |w| w.image(&path)).await
}
#[tauri::command]
pub async fn reveal_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
) -> CommandResult<()> {
    let path = scoped(&state, workspace_id, move |w| w.resolve(&path)).await?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn open_external(app: AppHandle, url: String) -> CommandResult<()> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http" | "mailto") {
        return Err("This link type is not allowed".into());
    }
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn compile_tex(
    state: State<'_, AppState>,
    workspace_id: u64,
    path: String,
    contents: String,
) -> CommandResult<feather_core::latex::Compilation> {
    let workspace = scoped(&state, workspace_id, |w| Ok(w.clone())).await?;
    if state.compiling.swap(true, Ordering::SeqCst) {
        return Err("A compilation is already running".into());
    }
    let compiling = state.compiling.clone();
    tauri::async_runtime::spawn_blocking(move || {
        struct Guard(Arc<AtomicBool>);
        impl Drop for Guard {
            fn drop(&mut self) {
                self.0.store(false, Ordering::SeqCst);
            }
        }
        let _guard = Guard(compiling);
        feather_core::latex::compile(&workspace, &path, &contents).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn install_cli() -> CommandResult<String> {
    #[cfg(unix)]
    {
        use std::{fs, io::Write, os::unix::fs::PermissionsExt};
        let user_home = std::env::var_os("HOME").ok_or("Home directory is unavailable")?;
        let dir = PathBuf::from(user_home).join(".local/bin");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let dest = dir.join("feather");
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&dest)
            .map_err(|e| {
                format!(
                    "Could not install {}: {e}. An existing command is never replaced.",
                    dest.display()
                )
            })?;
        file.write_all(cli_launcher(&executable).as_bytes())
            .map_err(|e| e.to_string())?;
        file.set_permissions(fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Installed {}. Add {} to PATH if needed. Keep Feather in its current location.",
            dest.display(),
            dir.display()
        ))
    }
    #[cfg(not(unix))]
    {
        Err("Build the feather-cli crate and put feather.exe on PATH alongside feather-desktop.exe. See README for installation.".into())
    }
}

#[cfg(unix)]
fn cli_launcher(executable: &std::path::Path) -> String {
    let quoted = executable.to_string_lossy().replace('\'', "'\\''");
    #[cfg(target_os = "macos")]
    let updater = format!(
        "exec /bin/bash -c '{}'",
        include_str!("../../scripts/update-macos.sh").replace('\'', "'\\''")
    );
    #[cfg(not(target_os = "macos"))]
    let updater = "echo 'feather update currently supports macOS.' >&2; exit 1";
    format!(
        "#!/bin/sh\n# Feather launcher\ncase \"${{1-}}\" in\n  --version|-V) echo 'feather {version}'; exit 0 ;;\n  --help|-h) echo 'Usage: feather [FILE | FOLDER] | update'; exit 0 ;;\n  update) [ \"$#\" -eq 1 ] || {{ echo 'Usage: feather update' >&2; exit 1; }}\n    {updater} ;;\nesac\nexec '{quoted}' \"$@\" >/dev/null 2>&1 &\n",
        version = env!("CARGO_PKG_VERSION")
    )
}

#[cfg(all(test, unix))]
mod launcher_tests {
    use super::cli_launcher;
    use std::{fs, process::Command};

    #[test]
    fn launcher_handles_quoted_paths_and_update_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let launcher = dir.path().join("feather");
        fs::write(
            &launcher,
            cli_launcher(std::path::Path::new(
                "/Applications/Writer's Apps/Feather.app/Contents/MacOS/feather-desktop",
            )),
        )
        .unwrap();
        let syntax = Command::new("/bin/sh")
            .arg("-n")
            .arg(&launcher)
            .output()
            .unwrap();
        assert!(syntax.status.success(), "{syntax:?}");
        let version = Command::new("/bin/sh")
            .arg(&launcher)
            .arg("--version")
            .output()
            .unwrap();
        assert!(version.status.success());
        assert_eq!(
            String::from_utf8_lossy(&version.stdout).trim(),
            concat!("feather ", env!("CARGO_PKG_VERSION"))
        );
        let invalid = Command::new("/bin/sh")
            .arg(&launcher)
            .args(["update", "extra"])
            .output()
            .unwrap();
        assert!(!invalid.status.success());
        assert!(String::from_utf8_lossy(&invalid.stderr).contains("Usage: feather update"));
    }
}
