#!/bin/bash
set -euo pipefail
KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="${1:-}"
if [ -z "$APP" ]; then
  for CANDIDATE in "$HOME/Applications/ShadowCyrene.app" "/Applications/ShadowCyrene.app" "$KIT_DIR/ShadowCyrene.app" "$KIT_DIR/../ShadowCyrene.app"; do
    if [ -d "$CANDIDATE" ]; then APP="$CANDIDATE"; break; fi
  done
fi
if [ ! -d "$APP" ]; then
  echo "Install ShadowCyrene 0.5.1 or later first."
  echo "Usage: bash Install-ShadowCyrene-Plugin.command /path/to/ShadowCyrene.app"
  exit 1
fi
ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/ShadowCyrene" "$KIT_DIR/install.cjs" "$APP"
echo "Plugin installed. You may close this window."
