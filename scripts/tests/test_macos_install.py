"""Exercise real Git and installer replacement in temporary directories.

Build tools are stubbed; no downloads, packages, or user apps are touched.
"""

import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import unittest


INSTALLER = Path(__file__).resolve().parents[1] / "install-macos.sh"


@unittest.skipUnless(sys.platform == "darwin", "macOS installer")
class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="feather-installer-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.remote = self.root / "remote"
        self.remote.mkdir()
        self.git("init", "-b", "main", cwd=self.remote)
        self.git("config", "user.name", "Installer Test", cwd=self.remote)
        self.git("config", "user.email", "test@example.invalid", cwd=self.remote)
        self.commit("first")
        self.source = self.root / "source"
        self.apps = self.root / "Applications"
        self.app = self.apps / "Feather.app"
        self.bin = self.root / "bin"
        self.desktop = self.root / "Desktop"
        self.tools = self.root / "tools"
        self.tools.mkdir()
        stub = self.tools / "stub"
        stub.write_text(f"#!{sys.executable}\n" + r'''
import os, pathlib, plistlib, shutil, sys
name = pathlib.Path(sys.argv[0]).name
root = pathlib.Path(os.environ["FEATHER_TEST_ROOT"])
if name == "ps":
    if os.environ.get("FEATHER_TEST_RUNNING"):
        print(root / "Applications/Feather.app/Contents/MacOS/feather-desktop")
elif name == "npm":
    if os.environ.get("FEATHER_TEST_BUILD_FAIL"):
        sys.exit(23)
    if sys.argv[1] == "run":
        bundle = root / "target/release/bundle/macos/Feather.app/Contents"
        shutil.rmtree(bundle.parent, ignore_errors=True)
        (bundle / "MacOS").mkdir(parents=True)
        (bundle / "Resources").mkdir()
        (bundle / "Info.plist").write_bytes(plistlib.dumps({"CFBundleIdentifier": "app.feather.editor"}))
        executable = bundle / "MacOS/feather-desktop"
        executable.write_text("#!/bin/sh\nexit 0\n")
        executable.chmod(0o755)
        (bundle / "Resources/icon.icns").write_bytes(b"test-icon")
        (bundle / "revision").write_text(pathlib.Path("revision").read_text())
elif name == "cargo":
    cli = root / "target/release/feather"
    cli.write_text("#!/bin/sh\necho 'feather 0.1.0'\n")
    cli.chmod(0o755)
elif name == "open":
    (root / "opened").write_text(sys.argv[1])
''')
        stub.chmod(0o755)
        for name in ("brew", "xcrun", "node", "rustc", "npm", "cargo", "codesign", "tectonic", "ps", "open"):
            (self.tools / name).symlink_to(stub)
        self.env = {
            **os.environ,
            "PATH": f"{self.tools}:/usr/bin:/bin:/usr/sbin:/sbin",
            "FEATHER_TEST_ROOT": str(self.root),
            "FEATHER_REPO": self.remote.as_uri(),
            "FEATHER_SOURCE_DIR": str(self.source),
            "FEATHER_APPLICATIONS_DIR": str(self.apps),
            "FEATHER_DESKTOP_DIR": str(self.desktop),
            "FEATHER_BIN_DIR": str(self.bin),
            "CARGO_TARGET_DIR": str(self.root / "target"),
            "FEATHER_SKIP_OPEN": "0",
        }

    def git(self, *args, cwd=None):
        return subprocess.check_output(
            ["git", *args], cwd=cwd, stderr=subprocess.STDOUT, text=True
        ).strip()

    def commit(self, revision):
        (self.remote / "revision").write_text(revision)
        self.git("add", "revision", cwd=self.remote)
        self.git("commit", "-m", revision, cwd=self.remote)

    def install(self, success=True, **env):
        result = subprocess.run(
            ["/bin/bash", str(INSTALLER)], env={**self.env, **env},
            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
        self.assertEqual(result.returncode == 0, success, result.stdout)
        return result.stdout

    def assert_revision(self, revision):
        self.assertEqual((self.app / "Contents/revision").read_text(), revision)
        self.assertFalse(list(self.apps.glob(".feather-install.*")))

    def test_rerun_pulls_replaces_removes_old_bundle_and_keeps_shortcut(self):
        self.install()
        self.assert_revision("first")
        self.assertEqual((self.desktop / "Feather.app").resolve(), self.app)
        self.assertEqual((self.root / "opened").read_text(), str(self.app))
        (self.app / "obsolete-resource").write_text("remove with old bundle")
        unrelated = self.apps / "Other.app"
        unrelated.mkdir()
        self.commit("second")
        self.install()
        self.assert_revision("second")
        self.assertFalse((self.app / "obsolete-resource").exists())
        self.assertTrue(unrelated.is_dir())
        self.assertEqual((self.desktop / "Feather.app").resolve(), self.app)
        self.assertEqual(self.git("rev-parse", "HEAD", cwd=self.source), self.git("rev-parse", "HEAD", cwd=self.remote))
        self.assertEqual(subprocess.check_output([self.bin / "feather", "--version"], text=True).strip(), "feather 0.1.0")
        self.install()  # An already-current install is idempotent too.
        self.assert_revision("second")

    def test_build_failure_keeps_installed_app(self):
        self.install()
        self.commit("second")
        self.install(success=False, FEATHER_TEST_BUILD_FAIL="1")
        self.assert_revision("first")

    def test_local_edits_are_preserved(self):
        self.install()
        (self.source / "revision").write_text("local edit")
        self.commit("second")
        self.assertIn("Source has local edits", self.install(success=False))
        self.assertEqual((self.source / "revision").read_text(), "local edit")
        self.assert_revision("first")

    def test_local_only_commit_is_not_installed(self):
        self.install()
        self.git("-c", "user.name=Installer Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "local", cwd=self.source)
        before = self.git("rev-parse", "HEAD", cwd=self.source)
        self.assertIn("local-only commits", self.install(success=False))
        self.assertEqual(self.git("rev-parse", "HEAD", cwd=self.source), before)
        self.assert_revision("first")

    def test_running_app_stops_before_fetch_or_build(self):
        self.install()
        self.commit("second")
        self.assertIn("Quit Feather", self.install(success=False, FEATHER_TEST_RUNNING="1"))
        self.assertEqual((self.source / "revision").read_text(), "first")
        self.assert_revision("first")

    def test_unrelated_app_is_never_replaced(self):
        contents = self.app / "Contents"
        contents.mkdir(parents=True)
        identity = plistlib.dumps({"CFBundleIdentifier": "some.other.app"})
        (contents / "Info.plist").write_bytes(identity)
        self.assertIn("Another app already occupies", self.install(success=False))
        self.assertEqual((contents / "Info.plist").read_bytes(), identity)


if __name__ == "__main__":
    unittest.main()
