#!/bin/bash
# Build Feather from source. No Apple account or prebuilt app required.
set -euo pipefail
fail() { printf '\nFeather: %s\n' "$*" >&2; exit 1; }
step() { printf '\n→ %s\n' "$*"; }
[[ "$(uname -s)" == Darwin ]] || fail 'This installer is for macOS. See docs/DEVELOPMENT.md for Linux and Windows.'
[[ "$EUID" -ne 0 ]] || fail 'Run this as your regular user, without sudo.'

feather_repo="${FEATHER_REPO:-https://github.com/partylikeits1983/feather.git}"
feather_source="${FEATHER_SOURCE_DIR:-$HOME/Library/Caches/Feather/source}"
feather_apps="${FEATHER_APPLICATIONS_DIR:-$HOME/Applications}"
feather_desktop="${FEATHER_DESKTOP_DIR:-$HOME/Desktop}"
feather_bin="${FEATHER_BIN_DIR:-$HOME/.local/bin}"
feather_app="$feather_apps/Feather.app"
feather_stage=''
feather_temp="$(mktemp -d "${TMPDIR:-/tmp}/feather-install.XXXXXX")"
cleanup() { rm -rf "$feather_temp"; [[ -z "$feather_stage" ]] || rm -rf "$feather_stage"; }
trap cleanup EXIT

# Homebrew's official installer also installs Apple's command line tools.
if ! command -v brew >/dev/null 2>&1; then
  if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)";
  elif [[ -x /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)";
  else
    step 'Installing Homebrew (macOS may ask for your password).'
    curl --fail --show-error --silent --location https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh -o "$feather_temp/homebrew.sh"
    /bin/bash "$feather_temp/homebrew.sh"
    if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)";
    elif [[ -x /usr/local/bin/brew ]]; then eval "$(/usr/local/bin/brew shellenv)";
    else fail 'Homebrew did not install successfully. Rerun this installer after installing Homebrew.'; fi
  fi
fi
if ! xcrun --find clang >/dev/null 2>&1; then
  step 'Complete the Apple Command Line Tools installer. Feather will continue when it finishes.'
  xcode-select --install || true
  until xcrun --find clang >/dev/null 2>&1; do sleep 5; done
fi
step 'Checking build tools.'
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  brew install node@22
  export PATH="$(brew --prefix node@22)/bin:$PATH"
fi
if ! command -v cargo >/dev/null 2>&1 || ! command -v rustc >/dev/null 2>&1; then brew install rust; fi
if ! command -v tectonic >/dev/null 2>&1; then brew install tectonic; fi
command -v git >/dev/null 2>&1 || fail 'Git is missing. Install the Apple Command Line Tools and rerun.'

step 'Getting Feather source.'
if [[ -e "$feather_source" ]]; then
  [[ -d "$feather_source/.git" ]] || fail "Source folder already exists and is not a Git checkout: $feather_source"
  [[ "$(git -C "$feather_source" remote get-url origin)" == "$feather_repo" ]] || fail "Source folder belongs to a different repository: $feather_source"
  [[ -z "$(git -C "$feather_source" status --porcelain)" ]] || fail "Source has local edits; keeping them safe. Commit or move them before rerunning: $feather_source"
  [[ "$(git -C "$feather_source" branch --show-current)" == main ]] || fail "Source is on a different branch. Switch it to main before rerunning: $feather_source"
  git -C "$feather_source" fetch origin main
  git -C "$feather_source" merge --ff-only origin/main
else
  mkdir -p "$(dirname "$feather_source")"
  git clone --depth 1 --branch main "$feather_repo" "$feather_source"
fi
cd "$feather_source"
step 'Building Feather. The first build can take several minutes.'
npm ci
npm run bundle -- --bundles app --config '{"bundle":{"macOS":{"signingIdentity":"-"}}}' -- --locked
cargo build --release --locked -p feather-cli
feather_target="${CARGO_TARGET_DIR:-$feather_source/target}"
[[ "$feather_target" == /* ]] || feather_target="$feather_source/$feather_target"
feather_bundle="$feather_target/release/bundle/macos/Feather.app"
[[ -x "$feather_bundle/Contents/MacOS/feather-desktop" && -f "$feather_bundle/Contents/Resources/icon.icns" ]] || fail 'The app bundle or its icon is missing.'
codesign --verify --deep --strict "$feather_bundle"

step 'Preparing LaTeX for offline use.'
# Fetch standard article + AMS packages now; the app itself never downloads them.
if ! tectonic --outdir "$feather_temp" examples/paper.tex; then
  printf '\nLaTeX cache setup failed. Markdown works; run tectonic your-paper.tex later to prepare LaTeX.\n' >&2
fi

step 'Installing the app and command.'
if [[ -e "$feather_app" || -L "$feather_app" ]]; then
  [[ ! -L "$feather_app" ]] || fail "App destination is a symlink; keeping it untouched: $feather_app"
  [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$feather_app/Contents/Info.plist" 2>/dev/null || true)" == app.feather.editor ]] || fail "Another app already occupies $feather_app"
  if ps -axo command= | /usr/bin/grep -F "$feather_app/Contents/MacOS/feather-desktop" | /usr/bin/grep -v grep >/dev/null; then
    fail 'Quit the installed Feather app, then rerun to finish updating. Your source build is cached.'
  fi
fi
if [[ -e "$feather_bin/feather" || -L "$feather_bin/feather" ]]; then
  [[ "$("$feather_bin/feather" --version 2>/dev/null || true)" == feather\ * ]] || fail "Another command already occupies $feather_bin/feather"
fi
mkdir -p "$feather_apps" "$feather_desktop" "$feather_bin"
feather_stage="$(mktemp -d "$feather_apps/.feather-install.XXXXXX")"
ditto "$feather_bundle" "$feather_stage/Feather.app"
if [[ -d "$feather_app" ]]; then mv "$feather_app" "$feather_stage/previous.app"; fi
if ! mv "$feather_stage/Feather.app" "$feather_app"; then
  [[ ! -d "$feather_stage/previous.app" ]] || mv "$feather_stage/previous.app" "$feather_app"
  fail 'Could not install Feather; the previous app was restored.'
fi
install -m 755 "$feather_target/release/feather" "$feather_bin/feather"
if [[ ! -e "$feather_desktop/Feather.app" && ! -L "$feather_desktop/Feather.app" ]]; then
  ln -s "$feather_app" "$feather_desktop/Feather.app"
fi
printf '\nInstalled: %s\nDesktop shortcut: %s\nCommand: %s\n' "$feather_app" "$feather_desktop/Feather.app" "$feather_bin/feather"
case ":$PATH:" in
  *":$feather_bin:"*) ;;
  *) printf 'To use feather from any terminal, add this to your shell profile:\n  export PATH="%s:$PATH"\n' "$feather_bin" ;;
esac
if [[ "${FEATHER_SKIP_OPEN:-0}" != 1 ]]; then open "$feather_app"; fi
