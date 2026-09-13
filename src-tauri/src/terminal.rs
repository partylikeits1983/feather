use crate::commands::AppState;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
pub struct TerminalInfo {
    id: u64,
    cwd: String,
}
struct Session {
    info: TerminalInfo,
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    flow: Arc<(Mutex<usize>, Condvar)>,
    alive: Arc<AtomicBool>,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
        self.flow.1.notify_all();
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}
#[derive(Default)]
pub struct TerminalState {
    session: Arc<Mutex<Option<Session>>>,
    counter: AtomicU64,
}

fn shell() -> PathBuf {
    #[cfg(windows)]
    {
        for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(root) = std::env::var_os(variable) {
                let path = PathBuf::from(root).join("Git/bin/bash.exe");
                if path.exists() {
                    return path;
                }
            }
        }
        PathBuf::from("bash.exe")
    }
    #[cfg(not(windows))]
    {
        PathBuf::from("/bin/bash")
    }
}
fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(2, 500),
        rows: rows.clamp(1, 300),
        pixel_width: 0,
        pixel_height: 0,
    }
}

#[tauri::command]
pub async fn terminal_start(
    app: AppHandle,
    workspace: State<'_, AppState>,
    state: State<'_, TerminalState>,
    workspace_id: u64,
    path: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalInfo, String> {
    let cwd = workspace.terminal_directory(workspace_id, &path)?;
    let slot = state.session.clone();
    let id = state.counter.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || {
        let mut slot = slot.lock().map_err(|e| e.to_string())?;
        if let Some(session) = slot.as_ref() {
            return Ok(session.info.clone());
        }
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(|e| e.to_string())?;
        let mut command = CommandBuilder::new(shell());
        command.args(["--login", "-i"]);
        command.cwd(&cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("BASH_SILENCE_DEPRECATION_WARNING", "1");
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| format!("Could not start Bash: {e}. On Windows, install Git Bash."))?;
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = Arc::new(Mutex::new(
            pair.master.take_writer().map_err(|e| e.to_string())?,
        ));
        let child = Arc::new(Mutex::new(child));
        let flow = Arc::new((Mutex::new(0_usize), Condvar::new()));
        let alive = Arc::new(AtomicBool::new(true));
        let info = TerminalInfo {
            id,
            cwd: cwd.to_string_lossy().into_owned(),
        };
        *slot = Some(Session {
            info: info.clone(),
            master: pair.master,
            writer,
            child: child.clone(),
            flow: flow.clone(),
            alive: alive.clone(),
        });
        std::thread::spawn(move || {
            let mut bytes = [0_u8; 4096];
            while alive.load(Ordering::SeqCst) {
                let count = match reader.read(&mut bytes) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                let (lock, ready) = &*flow;
                let Ok(mut pending) = lock.lock() else { break };
                while *pending >= 128 * 1024 && alive.load(Ordering::SeqCst) {
                    pending = match ready.wait(pending) {
                        Ok(pending) => pending,
                        Err(_) => return,
                    };
                }
                if !alive.load(Ordering::SeqCst) {
                    break;
                }
                *pending += count;
                drop(pending);
                if app
                    .emit("terminal-output", (id, bytes[..count].to_vec()))
                    .is_err()
                {
                    break;
                }
            }
            if let Ok(mut child) = child.lock() {
                let _ = child.wait();
            }
            let _ = app.emit("terminal-exit", id);
        });
        Ok(info)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, TerminalState>,
    id: u64,
    data: String,
) -> Result<(), String> {
    if data.len() > 1024 * 1024 {
        return Err("Paste at most 1 MB at a time".into());
    }
    let slot = state.session.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let writer = {
            let slot = slot.lock().map_err(|e| e.to_string())?;
            slot.as_ref()
                .filter(|s| s.info.id == id)
                .ok_or("This shell has ended")?
                .writer
                .clone()
        };
        let mut writer = writer.lock().map_err(|e| e.to_string())?;
        writer
            .write_all(data.as_bytes())
            .and_then(|_| writer.flush())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    id: u64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let slot = state.session.lock().map_err(|e| e.to_string())?;
    let session = slot
        .as_ref()
        .filter(|s| s.info.id == id)
        .ok_or("This shell has ended")?;
    session
        .master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn terminal_ack(state: State<'_, TerminalState>, id: u64, bytes: usize) {
    if let Ok(slot) = state.session.lock() {
        if let Some(session) = slot.as_ref().filter(|s| s.info.id == id) {
            if let Ok(mut pending) = session.flow.0.lock() {
                *pending = pending.saturating_sub(bytes);
                session.flow.1.notify_one();
            }
        }
    }
}
#[tauri::command]
pub fn terminal_stop(state: State<'_, TerminalState>, id: u64) -> Result<(), String> {
    let mut slot = state.session.lock().map_err(|e| e.to_string())?;
    if slot.as_ref().is_some_and(|s| s.info.id == id) {
        *slot = None;
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn bash_pty_accepts_input_and_streams_output() {
        let pair = native_pty_system().openpty(size(80, 24)).unwrap();
        let mut command = CommandBuilder::new("/bin/bash");
        command.args(["--noprofile", "--norc"]);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        pair.master.resize(size(100, 30)).unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let (send, receive) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let mut result = Vec::new();
            let mut buf = [0; 4096];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                result.extend_from_slice(&buf[..n]);
            }
            let _ = send.send(String::from_utf8_lossy(&result).into_owned());
        });
        writer
            .write_all(b"printf 'feather-%s\\n' 'pty-ok'; exit\n")
            .unwrap();
        writer.flush().unwrap();
        let result = receive.recv_timeout(std::time::Duration::from_secs(5));
        if result.is_err() {
            let _ = child.kill();
        }
        let _ = child.wait();
        assert!(result.unwrap().contains("feather-pty-ok"));
    }
}
