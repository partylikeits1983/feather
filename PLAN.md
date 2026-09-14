# Feather 0.1 implementation plan

Build a small, local Markdown + math editor with a Rust desktop core. A folder, an editor, a preview. No accounts, telemetry, extensions, language servers, or startup network calls.

User feedback during implementation adds persistent Vim keybindings, compact settings, whole-interface zoom, explorer creation buttons at the top, an on-demand current-file Git diff, an optional Bash PTY in the document directory, and PDF export for Markdown/TeX. These supersede the original exclusions of a terminal and Git UI; neither runs at startup.

## Architecture

- Tauri 2 desktop shell, one process, CLI path forwarding, native file dialogs.
- Independent `feather-core` Rust crate: workspace confinement, lazy file tree, UTF-8 documents, optimistic concurrency, atomic saves, filesystem notifications, optional Tectonic.
- Preact + CodeMirror 6. Document text stays in CodeMirror; typing does not rerender the application.
- A dedicated worker parses Markdown/GFM and renders KaTeX after 40 ms idle. Only the newest result is displayed. Source positions connect editor scrolling and preview navigation.
- Scoped Rust commands serve local images; raw Markdown HTML is disabled. No broad filesystem or shell permission is exposed to the WebView.
- System/light/dark themes via CSS variables. Restrained chrome and resizable panes.

## Build sequence

1. Scaffold Cargo workspace, frontend, Tauri window, capabilities and theme.
2. Implement path/CLI handling, lazy directory listing, quick open, native file/folder opening.
3. Implement CodeMirror, worker preview, GFM, math delimiters, local links/images, source mapping.
4. Implement 500 ms autosave, conflict detection, flush on switching/closing, file/folder create/rename/trash/duplicate/reveal, watcher events, scroll sync, pane resizing.
5. Add optional offline Tectonic compilation with timeout, debounce and PDF preview; CLI install, platform packaging configuration, CI checks, benchmarks, and usage documentation.

## Text and code editing update

1. Remove extension restrictions from file opening, quick open, creation, and the native dialog; validate UTF-8 contents before editing.
2. Reuse bundled language parsers for standalone code and both Git diff panes; keep unfamiliar file types plain.
3. Keep preview modes for Markdown/TeX and PDF export only for `.md`/`.tex`, preserving existing editing features.
4. Reduce explorer rows from 32 to 28 px and indentation steps from 16 to 12 px.
5. Replace block-snapping scroll sync with continuous, bidirectional pixel interpolation and easing.
6. Verify file round trips, highlighting, PDF visibility, existing editor workflows, and scrolling; build and launch locally for review before pushing.

## Acceptance checks

- Real Markdown files open, edit, save atomically and reopen correctly.
- Outside changes reload clean buffers; dirty buffers retain text and offer conflict resolution.
- Paths escaping the workspace, including symlinks, are rejected.
- Switching documents/workspaces and closing never silently discard pending saves.
- Markdown, GFM, inline/display math, fenced math and LaTeX delimiters render, including multiline `$$` equations with delimiters beside the formula.
- Keyboard workflows, both themes, file operations, local links/images and large input work.
- `cargo test`, `cargo clippy`, TypeScript, preview tests, UI smoke tests, frontend production build and a native build pass on the available machine.
- Vim enter/escape/navigation/toggle, Git baseline reads without index changes, PTY input/output, terminal location, zoom, and complete-document PDF preparation are verified.
- Markdown and TeX save directly to PDF through a native save dialog, without a print feature. Generated Markdown PDFs retain equations and pagination.
- macOS, Linux and Windows build jobs are provided; only locally run platforms are claimed verified.

## Performance budgets (targets, not measured promises)

| Operation | Target |
| --- | --- |
| Cold / warm launch | <500 / <200 ms |
| Open ordinary Markdown | <30 ms |
| Preview perceived update | <50 ms |
| Typing | <16 ms |
| Idle CPU | approximately 0% |

Benchmark fixtures cover 1 KB / 1 MB documents, 10 / 1,000 equations, a 10,000-file workspace and startup. Large previews are bounded to protect the DOM; the entire source remains editable and savable. PDF compilation requires an independently installed Tectonic and cached TeX bundle; it must never download packages implicitly.
