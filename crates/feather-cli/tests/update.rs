use std::process::Command;

#[test]
fn help_documents_update() {
    let output = Command::new(env!("CARGO_BIN_EXE_feather"))
        .arg("--help")
        .output()
        .unwrap();
    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("feather update"));
}

#[test]
fn update_rejects_extra_arguments() {
    let output = Command::new(env!("CARGO_BIN_EXE_feather"))
        .args(["update", "unexpected"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("Usage: feather update"));
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::{fs, os::unix::fs::PermissionsExt};

    // Exercise the real Rust -> Bash handoff without network access or installing
    // software. Each child gets its own PATH and temporary directory.
    fn run_update(download_exit: u8, installer_exit: u8) {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        let bin = root.join("bin");
        let downloads = root.join("downloads");
        fs::create_dir(&bin).unwrap();
        fs::create_dir(&downloads).unwrap();
        let curl = bin.join("curl");
        fs::write(
            &curl,
            r#"#!/bin/bash
set -eu
printf '%s\n' "$@" > "$FEATHER_TEST_ROOT/curl-args"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --output ]]; then destination="$2"; shift 2; else shift; fi
done
cp "$FEATHER_TEST_ROOT/installer" "$destination"
exit "$FEATHER_TEST_DOWNLOAD_EXIT"
"#,
        )
        .unwrap();
        fs::set_permissions(curl, fs::Permissions::from_mode(0o755)).unwrap();
        fs::write(
            root.join("installer"),
            "#!/bin/bash\nprintf 'ran' > \"$FEATHER_TEST_ROOT/ran\"\nexit \"$FEATHER_TEST_INSTALLER_EXIT\"\n",
        )
        .unwrap();
        let output = Command::new(env!("CARGO_BIN_EXE_feather"))
            .arg("update")
            .env("PATH", format!("{}:/usr/bin:/bin", bin.display()))
            .env("TMPDIR", &downloads)
            .env("FEATHER_TEST_ROOT", root)
            .env("FEATHER_TEST_DOWNLOAD_EXIT", download_exit.to_string())
            .env("FEATHER_TEST_INSTALLER_EXIT", installer_exit.to_string())
            .output()
            .unwrap();
        let expected_exit = if download_exit == 0 {
            installer_exit
        } else {
            download_exit
        };
        assert_eq!(
            output.status.code(),
            Some(i32::from(expected_exit)),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(root.join("ran").exists(), download_exit == 0);
        let args = fs::read_to_string(root.join("curl-args")).unwrap();
        assert!(args.lines().any(|line| line == "https://raw.githubusercontent.com/partylikeits1983/feather/main/scripts/install-macos.sh"));
        assert!(args.contains("--proto\n=https\n--proto-redir\n=https\n"));
        assert_eq!(fs::read_dir(downloads).unwrap().count(), 0);
    }

    #[test]
    fn update_runs_downloaded_installer_and_cleans_up() {
        run_update(0, 0);
    }

    #[test]
    fn failed_download_never_executes_partial_script() {
        run_update(22, 0);
    }

    #[test]
    fn installer_failure_reaches_the_calling_terminal() {
        run_update(0, 17);
    }
}
