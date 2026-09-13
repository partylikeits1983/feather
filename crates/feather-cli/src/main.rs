use std::{
    env,
    path::PathBuf,
    process::{Command, ExitCode, Stdio},
};

fn main() -> ExitCode {
    match launch() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("feather: {e}");
            ExitCode::FAILURE
        }
    }
}
fn launch() -> Result<(), String> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.iter().any(|s| s == "--help" || s == "-h") {
        println!("Feather — a quiet Markdown editor\n\nUsage: feather [FILE | FOLDER]\n       feather update\n\n  feather .\n  feather notes.md\n  feather ~/research\n\n  feather update    Build and reinstall the latest source (macOS).\n                    Quit Feather first; run from Terminal.\n\nSet FEATHER_BIN to override the desktop executable.");
        return Ok(());
    }
    if args.iter().any(|s| s == "--version" || s == "-V") {
        println!("feather {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if args.first().is_some_and(|arg| arg == "update") {
        if args.len() != 1 {
            return Err("Usage: feather update (no additional arguments)".into());
        }
        return update();
    }
    if args.len() > 1 {
        return Err("Expected one file or folder. Run feather --help.".into());
    }
    let path = PathBuf::from(args.first().cloned().unwrap_or_else(|| ".".into()))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let executable = if let Some(executable) = env::var_os("FEATHER_BIN") {
        PathBuf::from(executable)
    } else {
        let sibling = env::current_exe()
            .map_err(|e| e.to_string())?
            .with_file_name(if cfg!(windows) {
                "feather-desktop.exe"
            } else {
                "feather-desktop"
            });
        if sibling.exists() {
            sibling
        } else if cfg!(target_os = "macos") {
            let user_app = PathBuf::from(env::var_os("HOME").unwrap_or_default())
                .join("Applications/Feather.app/Contents/MacOS/feather-desktop");
            if user_app.exists() {
                user_app
            } else {
                PathBuf::from("/Applications/Feather.app/Contents/MacOS/feather-desktop")
            }
        } else {
            PathBuf::from("feather-desktop")
        }
    };
    Command::new(&executable)
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            format!(
                "Could not launch {}: {e}. Install Feather or set FEATHER_BIN.",
                executable.display()
            )
        })?;
    Ok(())
}

fn update() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::process::CommandExt;
        // Replace this process: the installer can then replace the CLI binary too.
        let error = Command::new("/bin/bash")
            .arg("-c")
            .arg(include_str!("../../../scripts/update-macos.sh"))
            .exec();
        Err(format!("Could not start the updater: {error}"))
    }
    #[cfg(not(target_os = "macos"))]
    Err(
        "feather update currently supports macOS. See docs/DEVELOPMENT.md for other platforms."
            .into(),
    )
}
