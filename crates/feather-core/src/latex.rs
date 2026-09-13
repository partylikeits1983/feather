use crate::{Error, Result, Workspace};
use base64::Engine;
use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;

#[derive(Serialize)]
pub struct Compilation {
    pub pdf: Option<String>,
    pub log: String,
}

// Finder-launched apps do not inherit the user's interactive shell PATH.
// Search installation directories directly, without starting a login shell.
fn tectonic_binary() -> Result<PathBuf> {
    let mut directories: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    #[cfg(target_os = "macos")]
    directories
        .extend(["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"].map(PathBuf::from));
    #[cfg(unix)]
    directories.extend(["/usr/local/bin", "/usr/bin", "/bin"].map(PathBuf::from));
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let home = PathBuf::from(home);
        directories.extend([home.join(".cargo/bin"), home.join(".local/bin")]);
    }
    find_binary(directories).ok_or_else(|| Error::Message(
        "Tectonic could not be found. Install Tectonic to enable LaTeX preview (on macOS: brew install tectonic), then click Compile again.".into(),
    ))
}

fn find_binary(directories: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    directories
        .into_iter()
        .filter(|dir| dir.is_absolute())
        .find_map(|dir| {
            let path = dir.join(if cfg!(windows) {
                "tectonic.exe"
            } else {
                "tectonic"
            });
            let metadata = fs::metadata(&path).ok()?;
            if !metadata.is_file() {
                return None;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o111 == 0 {
                    return None;
                }
            }
            Some(path)
        })
}

pub fn compile(workspace: &Workspace, relative: &str, contents: &str) -> Result<Compilation> {
    let source = workspace.resolve(relative)?;
    if !source
        .extension()
        .is_some_and(|x| x.eq_ignore_ascii_case("tex"))
    {
        return Err(Error::Message("Choose a .tex file to compile".into()));
    }
    let parent = source.parent().ok_or(Error::OutsideWorkspace)?;
    let mut input = tempfile::Builder::new()
        .prefix(".feather-")
        .suffix(".tex")
        .tempfile_in(parent)?;
    input.write_all(contents.as_bytes())?;
    input.flush()?;
    let output = tempfile::tempdir()?;
    let logfile = tempfile::tempfile()?;
    let mut command = Command::new(tectonic_binary()?);
    command
        .args(["--untrusted", "--only-cached", "--keep-logs", "--outdir"])
        .arg(output.path())
        .arg(input.path())
        .current_dir(parent)
        .stdin(Stdio::null())
        .stdout(logfile.try_clone()?)
        .stderr(logfile.try_clone()?);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| Error::Message(if e.kind() == std::io::ErrorKind::NotFound {
        "Tectonic is not installed. Install tectonic and cache its TeX bundle to enable offline PDF preview.".into()
    } else { e.to_string() }))?;
    let status = match child.wait_timeout(Duration::from_secs(30))? {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Message(
                "LaTeX compilation timed out after 30 seconds".into(),
            ));
        }
    };
    use std::io::{Read, Seek, SeekFrom};
    let mut log_reader = logfile;
    log_reader.seek(SeekFrom::Start(0))?;
    let mut log = String::new();
    log_reader.take(24_000).read_to_string(&mut log)?;
    let pdf_path = output
        .path()
        .join(input.path().file_stem().unwrap())
        .with_extension("pdf");
    let pdf = if status.success() && pdf_path.exists() {
        if fs::metadata(&pdf_path)?.len() > 32 * 1024 * 1024 {
            return Err(Error::Message("Compiled PDF exceeds 32 MB".into()));
        }
        Some(base64::engine::general_purpose::STANDARD.encode(fs::read(pdf_path)?))
    } else {
        None
    };
    Ok(Compilation { pdf, log })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_absolute_installation_and_skips_invalid_candidates() {
        let dir = tempfile::tempdir().unwrap();
        let binary = dir.path().join(if cfg!(windows) {
            "tectonic.exe"
        } else {
            "tectonic"
        });
        fs::write(&binary, "test compiler").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&binary, fs::Permissions::from_mode(0o644)).unwrap();
            assert!(find_binary([dir.path().to_path_buf()]).is_none());
            fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();
        }
        assert_eq!(
            find_binary([
                PathBuf::from("."),
                dir.path().join("missing"),
                dir.path().to_path_buf()
            ]),
            Some(binary)
        );
        assert!(find_binary([PathBuf::from(".")]).is_none());
    }
}
