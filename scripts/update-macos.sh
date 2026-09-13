#!/bin/bash
# Always use the current installer so future build changes reach existing installs.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { printf 'feather update currently supports macOS. See the development guide for other platforms.\n' >&2; exit 1; }
feather_update_script="$(mktemp "${TMPDIR:-/tmp}/feather-update.XXXXXX")"
trap 'rm -f "$feather_update_script"' EXIT
printf 'Getting the latest Feather installer…\n'
curl --proto '=https' --proto-redir '=https' --fail --show-error --silent --location \
  --connect-timeout 15 --max-time 60 \
  https://raw.githubusercontent.com/partylikeits1983/feather/main/scripts/install-macos.sh \
  --output "$feather_update_script"
/bin/bash "$feather_update_script"
