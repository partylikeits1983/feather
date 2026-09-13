<p align="center">
  <img src="frontend/public/feather.svg" width="80" height="80" alt="Feather logo" />
</p>
<h1 align="center">Feather</h1>
<p align="center">A minimal editor for Markdown and LaTeX.</p>

Built with Rust and Tauri. Local files. No accounts or telemetry.

![Feather editing Markdown with a live math preview](docs/images/feather.png)

## Features

- Live Markdown, math, and LaTeX/PDF preview.
- Autosave, file explorer, and quick open.
- Feather, GitHub, and Midnight profiles; light/dark themes and Zen mode.
- Resizable panes and interface zoom.
- Optional Vim keybindings.
- Editable Git diff and a Bash terminal (Ctrl + backtick).
- Save Markdown and LaTeX directly to PDF.
- Open files or folders with `feather .`.

## Install on macOS

Paste into Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/partylikeits1983/feather/main/scripts/install-macos.sh)"
```

[The script](scripts/install-macos.sh) installs missing tools through Homebrew, clones this repository, and builds Feather on your Mac. It installs `~/Applications/Feather.app`, adds its icon to your Desktop, and opens it. No prebuilt app download or Apple developer account needed.

The first build takes a few minutes. macOS/Homebrew may ask you to install Command Line Tools or enter your password. Rerun the same command to update after quitting Feather.

The `feather` command is installed in `~/.local/bin`; add that folder to your PATH if needed. Standard LaTeX packages are prepared during installation. For additional packages, run `tectonic your-paper.tex` once.

[Manual builds, testing, and Windows/Linux setup →](docs/DEVELOPMENT.md)
