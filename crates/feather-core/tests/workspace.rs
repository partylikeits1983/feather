use feather_core::{Error, Workspace};
use std::fs;

#[test]
fn roundtrip_atomic_save_preserves_format_and_permissions() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("notes.md"),
        b"\xef\xbb\xbf# Hello\r\ntext\r\n",
    )
    .unwrap();
    let (ws, selected) = Workspace::open(dir.path().join("notes.md")).unwrap();
    assert_eq!(selected.as_deref(), Some("notes.md"));
    let doc = ws.read("notes.md").unwrap();
    assert_eq!(doc.contents, "# Hello\ntext\n");
    let version = ws.save("notes.md", "# Updated\n", &doc.version).unwrap();
    assert_ne!(version, doc.version);
    assert_eq!(
        fs::read(dir.path().join("notes.md")).unwrap(),
        b"\xef\xbb\xbf# Updated\r\n"
    );
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn concurrent_edit_and_delete_never_overwrite_disk() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("a.md"), "original").unwrap();
    let (ws, _) = Workspace::open(dir.path()).unwrap();
    let doc = ws.read("a.md").unwrap();
    fs::write(dir.path().join("a.md"), "outside edit").unwrap();
    assert!(matches!(
        ws.save("a.md", "my edit", &doc.version),
        Err(Error::Conflict)
    ));
    assert_eq!(ws.read("a.md").unwrap().contents, "outside edit");
    fs::remove_file(dir.path().join("a.md")).unwrap();
    assert!(matches!(
        ws.save("a.md", "my edit", &doc.version),
        Err(Error::Conflict)
    ));
}

#[test]
fn scope_and_collision_checks() {
    let dir = tempfile::tempdir().unwrap();
    let (ws, _) = Workspace::open(dir.path()).unwrap();
    assert!(ws.resolve("../").is_err());
    assert!(ws.resolve("/etc/passwd").is_err());
    assert!(ws.create("../escape.md", false).is_err());
    ws.create("notes", true).unwrap();
    ws.create("notes/a.md", false).unwrap();
    assert!(ws.create("notes/a.md", false).is_err());
    ws.duplicate("notes/a.md", "notes/copy.md").unwrap();
    assert!(ws.rename("notes/a.md", "notes/copy.md").is_err());
    ws.rename("notes/a.md", "notes/b.md").unwrap();
    assert_eq!(ws.search(".md").unwrap().paths.len(), 2);
    assert!(ws.rename("", "new-root").is_err());
    assert!(ws.trash("").is_err());
}

#[cfg(unix)]
#[test]
fn symlinks_cannot_escape_scope() {
    let inside = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.md"), "secret").unwrap();
    std::os::unix::fs::symlink(outside.path(), inside.path().join("escape")).unwrap();
    let (ws, _) = Workspace::open(inside.path()).unwrap();
    assert!(ws.read("escape/secret.md").is_err());
    assert!(ws.create("escape/new.md", false).is_err());
    assert!(ws.trash("escape").is_err());
    assert!(ws.list("").unwrap().is_empty());
}

#[test]
fn rejects_binary_and_unsupported_documents() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("bad.md"), [0xff, 0xfe]).unwrap();
    fs::write(dir.path().join("image.png"), "image").unwrap();
    let (ws, _) = Workspace::open(dir.path()).unwrap();
    assert!(ws.read("bad.md").is_err());
    assert!(ws.read("image.png").is_err());
}
