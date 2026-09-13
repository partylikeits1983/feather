# Feather development guide

A quiet, local editor for Markdown and mathematics. Rust + Tauri 2, Preact, CodeMirror 6, and a Markdown/KaTeX worker. One folder, one document, one live preview.

## Run

Install a current stable Rust toolchain, Node.js 22+, and the [Tauri desktop prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

```sh
npm ci
npm run desktop
```

Open the included example workspace:

```sh
npm run desktop -- -- examples/notes.md
```

`npm run dev` is a browser preview with a persistent local scratchpad. Real filesystem operations run in the desktop application.

## Build and install

```sh
npm run bundle
```

Installers are produced under `target/release/bundle/` on the host platform. To build only the macOS app: `npm run bundle -- --bundles app`. Open `target/release/bundle/macos/Feather.app` or move it to Applications. Release distribution still needs platform signing/notarization credentials; these are local unsigned builds.

For the command-line launcher:

```sh
cargo install --path crates/feather-cli --locked
feather .
feather notes.md
feather ~/research
```

The launcher looks alongside itself for `feather-desktop`, then in macOS Applications folders or on the Linux/Windows PATH. `FEATHER_BIN` overrides discovery. For a local source build:

```sh
FEATHER_BIN="$PWD/target/release/feather-desktop" feather examples/notes.md
```

On macOS/Linux, **File → Install ‘feather’ Command…** also creates a launcher in `~/.local/bin` without replacing an existing command. Add that directory to PATH and keep the app in its installed location. On Windows, put `feather.exe` and `feather-desktop.exe` together in a directory on PATH. Subsequent launches forward the path to the existing process.

### Updating on macOS

Quit Feather, then run `feather update` (or `~/.local/bin/feather update`) from macOS Terminal. Rerunning the [source installer](../scripts/install-macos.sh) does the same thing. The updater downloads the current installer, fast-forwards its cached checkout to GitHub's `main`, builds the app and CLI, replaces `~/Applications/Feather.app` and `~/.local/bin/feather`, and opens Feather. The existing Desktop shortcut continues to work. The previous app bundle is removed after replacement succeeds; documents, preferences, and scratchpad data are preserved.

The source cache lives in `~/Library/Caches/Feather/source`. Updates stop if it contains local edits, local-only commits, another branch, or a different remote. Build or download failures leave the installed app in place. Use an external terminal: quitting Feather also closes its embedded shell. Updates are explicit; Feather does not check the network in the background. Windows and Linux currently require rebuilding from source.

For a custom installation, reuse the same `FEATHER_SOURCE_DIR`, `FEATHER_APPLICATIONS_DIR`, `FEATHER_DESKTOP_DIR`, and `FEATHER_BIN_DIR` overrides on each update. `FEATHER_REPO` selects a different Git remote; `FEATHER_SKIP_OPEN=1` suppresses reopening. A folder literally named `update` can still be opened with `feather ./update`.

## Writing

The **Features** menu in the native application menu bar (at the top of the screen on macOS) opens the built-in `Feather Guide.md` with a complete feature list, rendered math, a LaTeX example, and export instructions. Select a topic to jump to its section. It preserves your current document and workspace; **Back** returns to your file.

- Open a file or folder. Directories expand on demand; quick open searches only when requested.
- Edit Markdown with syntax highlighting, line numbers, undo/redo, search, multiple selections, and line wrapping.
- Preview GFM tables, task lists, local images, links, and KaTeX mathematics. `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, aligned equations, and fenced `math` are supported.
- Files autosave after 500 ms idle. Switching files/workspaces and closing through the window or app menu flush pending writes. Failed saves keep the editor open.
- Outside edits reload clean documents. Dirty conflicts keep your text and offer side-by-side review, explicit overwrite, or save a copy. Deletion uses the system trash.
- Drag the pane dividers, switch source/split/preview mode, or double-click a rendered block to jump to its source. The chain button toggles source-position scroll synchronization.
- Settings offers Feather, GitHub, and Midnight UI profiles, each with System (default), Light, and Dark appearance. Profiles apply instantly to the editor, preview, explorer, diff, and terminal, and persist locally.
- **⌘J** (Ctrl+J on Windows/Linux) toggles **Zen mode**, which hides the header, sidebar, and pane labels. Settings and an Exit Zen mode button stay available in the compact document toolbar. Toggling Zen preserves edits and undo history.
- Click the workspace heading to collapse or expand the entire tree; expanded subfolders are preserved.
- **Settings → Vim mode** enables modal editing and persists between launches. Use `h/j/k/l`, `w/b`, `gg/G`, `/` search, `v` selection, `i/a/o` to insert, `Esc` for Normal mode, `u` to undo and `:w` to save. Turning it off preserves the document and undo history. The Vim extension loads only when enabled. Repeated unmodified Escape presses remain inside a focused Vim editor, including the editable diff, so macOS does not interpret a spare Escape as leaving fullscreen. Dialogs and terminal input retain their own Escape behavior. Use **View → Toggle Full Screen** or **⌃⌘F** on macOS to leave fullscreen; **⌘J** controls Zen independently.
- New File / New Folder buttons sit beside the workspace name at the top of the explorer.
- **Git diff** compares the current document, including unsaved edits, with its `HEAD` version. The current-file pane is editable, with autosave, undo/redo, search, and your Vim setting. Edits stay synchronized with the main editor. The HEAD pane is read-only. Additions/deletions update as you type, with previous/next change controls and Refresh. Git is called only when this view opens or refreshes; editing does not stage, commit, or push.
- **Ctrl+`** opens a minimal Bash terminal in the active document's directory (workspace root for the scratchpad). Hide it with the same shortcut; the shell continues running. Stop Shell ends it. Switching documents does not change an already running shell's directory. Windows requires Git Bash; macOS/Linux use `/bin/bash`. The shell has your normal user permissions, including whatever repository access your Git configuration provides.
- **⌘+ / ⌘− / ⌘0** (Ctrl on Windows/Linux) zoom the entire interface in/out/reset. Zoom persists across launches and is also adjustable in Settings.
- **Export PDF** opens a native save dialog and writes a PDF directly. Markdown exports include the complete document, equations, and local images in an A4 layout; no print window or printer selection appears. TeX exports compile the current text and save the resulting PDF. The live preview length cap does not apply to export. Existing destination files are replaced atomically only after generation succeeds.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| New file | ⌘N | Ctrl+N |
| Open file / folder | ⌘O / ⌘⇧O | Ctrl+O / Ctrl+Shift+O |
| Save | ⌘S | Ctrl+S |
| Toggle Zen mode | ⌘J | Ctrl+J |
| Undo | ⌘Z | Ctrl+Z |
| Redo | ⌘⇧Z | Ctrl+Shift+Z |
| Quick open | ⌘P | Ctrl+P |
| Search document | ⌘F | Ctrl+F |
| Toggle sidebar | ⌘B | Ctrl+B |
| Toggle preview | ⌘\ | Ctrl+\ |

## TeX / PDF

Install [Tectonic](https://tectonic-typesetting.github.io/en-US/install/) separately. Compile your document once from the terminal to populate its TeX cache (this explicit preparation can download TeX resources):

```sh
tectonic paper.tex
```

Feather invokes `tectonic --untrusted --only-cached`, on a temporary source next to the original so relative includes work. Edits trigger a compile after 300 ms idle, with one compilation at a time and a 30-second timeout. Generated files live in a temporary output directory and are cleaned up. Failed compilation keeps the last successful PDF and shows the log. A lazily loaded PDF.js viewer renders pages inside Feather with selectable text and page navigation. It does not depend on a system PDF plugin. Compiler discovery checks PATH and common Homebrew, MacPorts, Cargo, and user-local installation directories, including when opened from Finder.

Tectonic is a separate local executable. Its untrusted mode disables known unsafe TeX features; it is not an OS filesystem sandbox. Only compile TeX sources you trust. Some documents depend on their job name or external build tools and may need a conventional LaTeX workflow.

## Data and boundaries

Rust owns document file I/O. Document commands are confined to the current workspace session; native dialogs, CLI arguments and OS file-open events grant a new workspace. Every document path is checked lexically and canonically. The explorer skips symlinks; links outside the root are refused. Native Save PDF dialogs grant the chosen output path. The optional terminal intentionally launches a real shell with your user permissions; it is not a workspace sandbox.

Saves hash the previous bytes, write a temporary sibling, preserve permissions and CRLF/UTF-8 BOM, sync, recheck the expected hash, then atomically replace the destination. This detects ordinary external edits; unrelated writers do not participate in a global filesystem transaction, so a very narrow concurrent-writer race remains. Force-quit/power loss during the 500 ms unsaved interval can lose those latest keystrokes.

Raw Markdown HTML is disabled. External links open through the OS and allow only HTTP(S)/mailto. Local raster/SVG images load through a scoped command; remote images are disabled. Fonts ship with the app. No telemetry, accounts, startup network requests, extensions, language servers, or background Git scanning. Vim, the terminal renderer, the diff viewer, and the PDF viewer load only when used.

## Performance

Product targets, to be measured per platform:

| Operation | Target |
| --- | --- |
| Cold / warm launch | <500 / <200 ms |
| Normal Markdown open | <30 ms |
| Perceived preview update | <50 ms |
| Typing latency | <16 ms |
| Idle CPU | approximately 0% |

Typing updates CodeMirror immediately. A separate worker handles parsing and KaTeX after a 40 ms debounce; stale results are discarded. The preview is capped at 180,000 characters to bound rendering work, while the full source remains editable and savable up to 32 MB. Large-file main-thread string copies and preview DOM replacement still need profiling; these targets are not claimed as achieved.

Initial measurements on the development macOS ARM64 machine (warm runs; not end-to-end):

| Benchmark | Measurement |
| --- | --- |
| Rust read, 1 KB / 1 MB | 0.040 / 0.839 ms mean |
| Rust list, 10,001 files | 10.167 ms |
| Markdown parse + HTML, 1 KB | 2.47 ms median |
| KaTeX parse + HTML, 10 / 1,000 equations | 7.33 / 328.89 ms median |

See [benchmarks](../benchmarks/README.md) for the commands and measurement limits.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:ui
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
python3 -m unittest discover -s scripts/tests -v  # macOS installer checks
cargo bench -p feather-core --bench filesystem
npm run bench:preview
```

The UI tests exercise a real browser and an explicit mocked IPC transport; Rust integration tests exercise actual temporary files. CI is configured to build on macOS, Windows, and Linux. macOS is the locally tested native platform; the other platform jobs have not been run remotely.

The architecture and build sequence are in [PLAN.md](../PLAN.md). Framework references: [Tauri](https://v2.tauri.app/start/), [single-instance support](https://v2.tauri.app/plugin/single-instance/), [remark-math / rehype-katex](https://github.com/remarkjs/remark-math).

Native PDF regression check (with `npm run dev` running):

```sh
cargo run -p feather-desktop --example pdf_smoke -- /absolute/input.html /absolute/output.pdf
```

The smoke test uses an invisible native WebView and the same PDF renderer as export. Its HTML input should be the rendered Markdown, including KaTeX markup. The reported multiline FRI equations are preserved as `tests/fixtures/from-codes-to-proofs.md` and covered by worker and UI tests. Native PDF generation has been visually checked on macOS; Windows/Linux require their platform checks.
