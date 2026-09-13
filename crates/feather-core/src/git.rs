use crate::{Error, Result, Workspace};
use serde::Serialize;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::Path,
    process::{Command, ExitStatus, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBaseline {
    pub contents: String,
    pub revision: Option<String>,
    pub is_new: bool,
}

fn git(directory: &Path, args: &[&str]) -> Result<(ExitStatus, String, String)> {
    let output = tempfile::tempfile()?;
    let error = tempfile::tempfile()?;
    let mut command = Command::new("git");
    command
        .args([
            "--no-pager",
            "--no-optional-locks",
            "-c",
            "core.fsmonitor=false",
            "-C",
        ])
        .arg(directory)
        .args(args)
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(output.try_clone()?)
        .stderr(error.try_clone()?);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|e| {
        Error::Message(if e.kind() == std::io::ErrorKind::NotFound {
            "Install Git to compare this file with its last commit.".into()
        } else {
            e.to_string()
        })
    })?;
    let status = match child.wait_timeout(Duration::from_secs(10))? {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Message(
                "Git did not respond within 10 seconds".into(),
            ));
        }
    };
    fn text(mut file: fs::File, limit: u64) -> Result<String> {
        if file.metadata()?.len() > limit {
            return Err(Error::Message(
                "This Git revision exceeds the 32 MB document limit".into(),
            ));
        }
        file.seek(SeekFrom::Start(0))?;
        let mut text = String::new();
        file.read_to_string(&mut text)
            .map_err(|_| Error::Message("The Git revision is not UTF-8 text".into()))?;
        Ok(text)
    }
    Ok((
        status,
        text(output, crate::document::MAX_DOCUMENT_BYTES)?,
        text(error, 64 * 1024)?,
    ))
}

/// Read only the selected document's committed blob. No status walk, hooks, difftool, or index writes.
pub fn baseline(workspace: &Workspace, relative: &str) -> Result<GitBaseline> {
    let path = workspace.resolve(relative)?;
    let (status, root, _) = git(&workspace.root, &["rev-parse", "--show-toplevel"])?;
    if !status.success() {
        return Err(Error::Message(
            "This file is not inside a Git repository.".into(),
        ));
    }
    let root = Path::new(root.trim_end()).canonicalize()?;
    let relative = path
        .strip_prefix(&root)
        .map_err(|_| Error::OutsideWorkspace)?
        .to_string_lossy()
        .replace('\\', "/");
    let (status, revision, _) = git(&root, &["rev-parse", "--verify", "HEAD"])?;
    if !status.success() {
        return Ok(GitBaseline {
            contents: String::new(),
            revision: None,
            is_new: true,
        });
    }
    let revision = revision.trim().to_owned();
    let (status, tracked, error) = git(&root, &["ls-tree", "-z", &revision, "--", &relative])?;
    if !status.success() {
        return Err(Error::Message(error));
    }
    if tracked.is_empty() {
        return Ok(GitBaseline {
            contents: String::new(),
            revision: Some(revision),
            is_new: true,
        });
    }
    let object = format!("{revision}:{relative}");
    let (status, contents, error) =
        git(&root, &["show", "--no-ext-diff", "--no-textconv", &object])?;
    if !status.success() {
        return Err(Error::Message(error));
    }
    Ok(GitBaseline {
        contents: contents
            .trim_start_matches('\u{feff}')
            .replace("\r\n", "\n"),
        revision: Some(revision),
        is_new: false,
    })
}
