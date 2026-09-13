mod commands;
mod export;
mod pdf;
mod terminal;

use commands::AppState;
use tauri::{Emitter, Manager};

pub fn run() {
    let initial = std::env::args_os()
        .skip(1)
        .find(|a| !a.to_string_lossy().starts_with('-'))
        .map(std::path::PathBuf::from);
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            if let Some(path) = args.iter().skip(1).find(|a| !a.starts_with('-')) {
                let path = std::path::Path::new(&cwd).join(path);
                if let Ok(mut pending) = app.state::<AppState>().pending.lock() {
                    *pending = Some(path);
                }
                let _ = app.emit("open-requested", ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(initial))
        .manage(terminal::TerminalState::default())
        .manage(export::ExportState::default())
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            let open_file =
                MenuItem::with_id(app, "open-file", "Open File…", true, Some("CmdOrCtrl+O"))?;
            let open_folder = MenuItem::with_id(
                app,
                "open-folder",
                "Open Folder…",
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?;
            let new_file = MenuItem::with_id(
                app,
                "new-file",
                "New Markdown File…",
                true,
                Some("CmdOrCtrl+N"),
            )?;
            let save = MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?;
            let install = MenuItem::with_id(
                app,
                "install-cli",
                "Install ‘feather’ Command…",
                true,
                None::<&str>,
            )?;
            let file = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_file,
                    &open_file,
                    &open_folder,
                    &save,
                    &PredefinedMenuItem::separator(app)?,
                    &install,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;
            let edit = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;
            let menu = Menu::new(app)?;
            #[cfg(target_os = "macos")]
            menu.append(&Submenu::with_items(
                app,
                "Feather",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Feather"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &MenuItem::with_id(app, "quit", "Quit Feather", true, Some("CmdOrCtrl+Q"))?,
                ],
            )?)?;
            menu.append(&file)?;
            menu.append(&edit)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu-action", event.id().as_ref());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_requested,
            commands::quit_app,
            commands::git_baseline,
            export::export_markdown,
            export::export_payload,
            export::export_ready,
            export::export_failed,
            export::save_pdf,
            terminal::terminal_start,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_stop,
            terminal::terminal_ack,
            commands::choose_workspace,
            commands::list_directory,
            commands::search_files,
            commands::read_document,
            commands::save_document,
            commands::create_entry,
            commands::rename_entry,
            commands::duplicate_entry,
            commands::trash_entry,
            commands::read_image,
            commands::reveal_entry,
            commands::open_external,
            commands::compile_tex,
            commands::install_cli
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Feather")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(path) = urls.into_iter().find_map(|u| u.to_file_path().ok()) {
                    if let Ok(mut pending) = app.state::<AppState>().pending.lock() {
                        *pending = Some(path);
                    }
                    let _ = app.emit("open-requested", ());
                }
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            let _ = (app, event);
        });
}
