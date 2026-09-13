use crate::{Error, Result, Workspace};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
pub type FileWatcher = RecommendedWatcher;

pub fn watch(
    workspace: &Workspace,
    on_change: impl Fn(Vec<String>) + Send + 'static,
) -> Result<RecommendedWatcher> {
    let root = workspace.root.clone();
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(event) = event {
            if matches!(event.kind, notify::EventKind::Access(_)) {
                return;
            }
            let paths: Vec<_> = event
                .paths
                .iter()
                .filter_map(|p| p.strip_prefix(&root).ok())
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .filter(|p| {
                    !p.split('/')
                        .any(|s| s == ".git" || s.starts_with(".feather-"))
                })
                .collect();
            if !paths.is_empty() {
                on_change(paths);
            }
        }
    })
    .map_err(|e| Error::Message(e.to_string()))?;
    watcher
        .watch(&workspace.root, RecursiveMode::Recursive)
        .map_err(|e| Error::Message(e.to_string()))?;
    Ok(watcher)
}
