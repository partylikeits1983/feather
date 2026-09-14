# Feather feature guide

Feather is a minimal, local editor for text, code, Markdown, and LaTeX. Open a folder, write, and see the result alongside your source.

This guide is a Markdown document rendered by Feather. Choose a topic from **Features** in the native menu bar at the top of the screen on macOS, or scroll through the examples. **Back** returns to your previous document.

## Markdown and math

Write headings, **bold text**, *italics*, `inline code`, lists, quotes, links, and tables. Source, split, and preview views are available in the toolbar.

- [x] Live Markdown preview
- [x] Tables and task lists
- [x] Inline and display mathematics
- [x] Local images and links between documents

| Write | Result |
| --- | --- |
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `code` `` | `code` |
| `$e^{i\pi} + 1 = 0$` | $e^{i\pi} + 1 = 0$ |

For a displayed equation, surround the expression with `$$`:

$$
f(X) = \sum_{i=0}^{d} a_i X^i.
$$

Multiline equations work too:

$$ g(x^2)=\frac{w(x)+w(-x)}{2}+
\alpha\frac{w(x)-w(-x)}{2x}.$$

Feather also accepts `\(...\)`, `\[...\]`, aligned equations, and fenced `math` blocks.

Relative Markdown links open inside Feather. Local images render from the opened workspace; web links open in your browser. Double-click a preview block to jump to its source. The chain button smoothly synchronizes scrolling in both directions, matching positions between source blocks.

## LaTeX and PDF

Open a `.tex` file to see a compiled PDF alongside its source. Copy this example into a new file named `paper.tex`:

```tex
\documentclass{article}
\usepackage{amsmath,amssymb}
\begin{document}
\section{A small observation}
For a polynomial over a field $\mathbb{F}$,
\[
  f(X) = \sum_{i=0}^{d} a_i X^i.
\]
Two distinct degree-$d$ polynomials agree at no more than $d$ points.
\end{document}
```

Feather compiles after a short pause in typing. The PDF viewer has selectable text, page navigation, and zoom. A failed compile shows its error and keeps the last successful PDF visible.

The macOS installer includes Tectonic and prepares standard LaTeX packages. If your document needs additional packages, run `tectonic paper.tex` once in the terminal. Feather then uses the downloaded cache to compile offline.

## Saving and exporting

Files autosave after 500 ms without typing. **Command+S** on macOS, or **Ctrl+S** elsewhere, saves immediately. Feather also saves pending edits before switching documents or closing through its window or menu.

Use **Export PDF** in the document toolbar, choose a filename, and save:

- Markdown exports include the complete rendered document, local images, and mathematics.
- LaTeX exports compile the current source and save its PDF.
- Export writes a PDF directly, with no print dialog.

You can export this guide to try it. It is read only; your own Markdown and LaTeX files remain editable.

If another app changes an open file, Feather reloads it when there are no pending edits. Otherwise, **Review disk** lets you compare both versions and choose which to keep, or save your text as a copy.

## Files and workspace

Open any UTF-8 text file or a folder from the workspace button or the File menu. Code, `Cargo.toml`, `.env`, extensionless files, and unfamiliar extensions are all editable. Use the file explorer to navigate, or **Command+P / Ctrl+P** to find a file by name.

- Click the workspace heading to collapse or expand the entire tree.
- The buttons beside it create a file or folder.
- Item action menus offer rename, move to trash, and reveal in the file manager. Files can also be duplicated; folder menus can create items inside that folder.
- Scratchpad lives at the bottom-left. Its text is saved locally between launches.

The terminal launcher accepts a file or folder:

```bash
feather .
feather notes.md
feather paper.tex
```

If Feather is already running, the command opens the requested document or workspace in that instance.

## Editing and Vim

The editor supports undo/redo, search, multiple selections, syntax highlighting, line numbers, bracket matching, and line wrapping.

Code files automatically use Lean (`.lean`), Rust (`.rs`), TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`), C (`.c`, `.h`), or Python (`.py`) highlighting. Other text files open as plain text. Code and plain text use the source editor; the PDF export button appears only for `.md` and `.tex`. Autosave, Vim, search, and Git diff work the same way for all text files.

Fenced code blocks support Rust (`rust`, `rs`), TypeScript (`typescript`, `ts`, `tsx`), Python (`python`, `py`), Lean (`lean`, `lean4`), JavaScript, and C. Colours follow your UI profile in both panes and Git diff. PDF exports keep highlighting with a light palette. Unknown language labels use C highlighting; unlabelled blocks and `text` stay plain. The language rules ship with Feather and load only when needed. Lean highlighting covers syntax; it does not check proofs.

Enable **Settings → Vim mode** for modal navigation:

| Key | Action |
| --- | --- |
| `h j k l` | Move left, down, up, right |
| `w` / `b` | Next / previous word |
| `gg` / `G` | First / last line |
| `i` / `a` / `o` | Insert / append / open a line |
| `Esc` | Return to Normal mode |
| `v` | Visual selection |
| `/` | Search |
| `u` | Undo |
| `:w` | Save |

Vim can be toggled off without losing your document or undo history.

In Zen mode and macOS fullscreen, **Esc** returns to Normal mode and stays in the editor, even when pressed again. Use **i** to insert text or **v** to select it. **⌘J** toggles Zen; **Ctrl+Command+F**, or **View → Toggle Full Screen**, controls fullscreen separately.

## Git diff and terminal

**Git diff** compares the active file with its Git `HEAD` version. Removed lines are highlighted red on the left; added lines are green on the right.

The current-file pane is editable and supports autosave, undo/redo, search, and Vim. Changes are synchronized with the main editor. Use the arrows to move between changes and **Refresh Git diff** after a commit or other Git operation.

**Ctrl + backtick** opens Bash in the active document's directory. For the scratchpad or this guide, it starts at the workspace root. An existing shell keeps its working directory as you switch files.

```bash
git status
git add notes.md
git commit -m "Update notes"
git push
```

These commands run only when you enter them. Hiding the terminal keeps the shell alive; **Stop shell** ends it. Windows requires Git Bash.

## Appearance and shortcuts

**Settings** contains Feather, GitHub, and Midnight profiles, each with system, light, and dark appearance. Try **GitHub → Dark** for a neutral dark interface with blue accents.

Resize the sidebar and editor/preview split by dragging their dividers. Zoom changes the whole interface. Appearance, profile, Vim, Zen, and zoom settings persist between launches.

**Zen mode** hides the header, sidebar, and pane labels. Toggle it with **Command+J** on macOS, or **Ctrl+J** elsewhere. The compact toolbar keeps Settings and an Exit Zen mode control available. Features remains in the native menu bar.

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| New Markdown file | ⌘N | Ctrl+N |
| Open file | ⌘O | Ctrl+O |
| Open folder | ⌘⇧O | Ctrl+Shift+O |
| Save | ⌘S | Ctrl+S |
| Undo / redo | ⌘Z / ⌘⇧Z | Ctrl+Z / Ctrl+Shift+Z |
| Find a file | ⌘P | Ctrl+P |
| Find in document | ⌘F | Ctrl+F |
| Toggle sidebar | ⌘B | Ctrl+B |
| Toggle preview | ⌘\ | Ctrl+\ |
| Toggle Zen mode | ⌘J | Ctrl+J |
| Toggle fullscreen | ⌃⌘F | — |
| Toggle terminal | Ctrl + backtick | Ctrl + backtick |
| Zoom in / out / reset | ⌘+ / ⌘− / ⌘0 | Ctrl++ / Ctrl+− / Ctrl+0 |

The keyboard button, or **Features → Keyboard shortcuts**, opens the quick reference.

## Updating Feather

On macOS, quit Feather and run this in the macOS Terminal app:

```bash
~/.local/bin/feather update
```

With the command on your PATH, `feather update` works too. Rerunning the install command from the README also updates Feather. Both pull the latest source, rebuild, replace the previous app, and reopen it. Your documents, scratchpad, and settings are kept. Updates stop if the cached source has local changes. Windows and Linux currently use a manual source build.
