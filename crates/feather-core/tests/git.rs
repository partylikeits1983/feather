use feather_core::{git::baseline, Workspace};
use std::{fs, path::Path, process::Command};

fn git(dir: &Path, args: &[&str]) {
    let result = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
}

#[test]
fn reads_head_without_changing_index_or_working_copy() {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-q"]);
    fs::create_dir(dir.path().join("notes")).unwrap();
    fs::write(dir.path().join("notes/a.md"), "# Original\n").unwrap();
    git(dir.path(), &["add", "notes/a.md"]);
    git(
        dir.path(),
        &[
            "-c",
            "user.name=Feather Test",
            "-c",
            "user.email=test@localhost",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-qm",
            "test fixture",
        ],
    );
    fs::write(dir.path().join("notes/a.md"), "# Staged\n").unwrap();
    git(dir.path(), &["add", "notes/a.md"]);
    fs::write(dir.path().join("notes/a.md"), "# Working\n").unwrap();
    let index = fs::read(dir.path().join(".git/index")).unwrap();
    let (ws, _) = Workspace::open(dir.path().join("notes")).unwrap();
    let result = baseline(&ws, "a.md").unwrap();
    assert_eq!(result.contents, "# Original\n");
    assert!(!result.is_new);
    assert_eq!(result.revision.unwrap().len(), 40);
    assert_eq!(fs::read(dir.path().join(".git/index")).unwrap(), index);
    assert_eq!(ws.read("a.md").unwrap().contents, "# Working\n");
    fs::write(dir.path().join("notes/new.md"), "new").unwrap();
    assert!(baseline(&ws, "new.md").unwrap().is_new);
    assert!(baseline(&ws, "../../outside.md").is_err());
}

#[test]
fn handles_non_repository_and_unborn_head() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("a.md"), "new").unwrap();
    let (ws, _) = Workspace::open(dir.path()).unwrap();
    assert!(baseline(&ws, "a.md").is_err());
    git(dir.path(), &["init", "-q"]);
    let result = baseline(&ws, "a.md").unwrap();
    assert!(result.is_new);
    assert_eq!(result.contents, "");
    assert!(result.revision.is_none());
}
