#!/usr/bin/env bash
# Linux: adds your OS to the applications menu (a .desktop launcher that runs launch.sh). Asks before writing.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
NAME="$(python3 -c "import sys; sys.path.insert(0, '$ROOT/routines'); import config; print(config.load().get('name') or 'Agentic OS')")"
FILE="$HOME/.local/share/applications/agentic-os.desktop"
echo "This will create $FILE (menu entry \"$NAME\" → $HERE/launch.sh)."
read -r -p "Continue? [y/N] " ok; [ "$ok" = "y" ] || [ "$ok" = "Y" ] || { echo "Cancelled."; exit 0; }
mkdir -p "$(dirname "$FILE")"
cat > "$FILE" <<DESK
[Desktop Entry]
Type=Application
Name=$NAME
Comment=Agentic OS dashboard
Exec=bash "$HERE/launch.sh"
Terminal=false
Categories=Utility;
DESK
echo "✓ \"$NAME\" is now in your applications menu."
