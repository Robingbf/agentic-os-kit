#!/usr/bin/env bash
# Remove the routine runner's scheduler entry installed by install.sh (asks for confirmation first).
set -euo pipefail

OS="$(uname -s)"
answer_yes() {
  printf '\nProceed? [y/N] '
  read -r answer || answer=""
  case "$answer" in y|Y|yes|YES) return 0 ;; *) echo "Cancelled, nothing changed."; exit 0 ;; esac
}

if [ "$OS" = "Darwin" ]; then
  LABEL="com.agentic-os.routines"
  TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
  if [ ! -f "$TARGET" ]; then echo "Nothing to remove ($TARGET does not exist)."; exit 0; fi
  echo "This will unload $LABEL (launchctl bootout gui/$(id -u)) and delete $TARGET."
  answer_yes
  launchctl bootout "gui/$(id -u)" "$TARGET" 2>/dev/null || true
  rm -f "$TARGET"
  echo "Removed. If you set a wake schedule with pmset, undo it with: sudo pmset repeat cancel"
  exit 0
fi

if [ "$OS" = "Linux" ]; then
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  HAS_UNITS=0; HAS_CRON=0
  [ -f "$UNIT_DIR/agentic-os-routines.timer" ] && HAS_UNITS=1
  command -v crontab >/dev/null 2>&1 && crontab -l 2>/dev/null | grep -q '# agentic-os-routines$' && HAS_CRON=1
  if [ "$HAS_UNITS" = 0 ] && [ "$HAS_CRON" = 0 ]; then echo "Nothing to remove."; exit 0; fi
  echo "This will:"
  [ "$HAS_UNITS" = 1 ] && echo "  - disable agentic-os-routines.timer and delete its two unit files in $UNIT_DIR"
  [ "$HAS_CRON" = 1 ] && echo "  - remove the '# agentic-os-routines' line from your crontab"
  answer_yes
  if [ "$HAS_UNITS" = 1 ]; then
    systemctl --user disable --now agentic-os-routines.timer 2>/dev/null || true
    rm -f "$UNIT_DIR/agentic-os-routines.timer" "$UNIT_DIR/agentic-os-routines.service"
    systemctl --user daemon-reload 2>/dev/null || true
  fi
  if [ "$HAS_CRON" = 1 ]; then
    crontab -l 2>/dev/null | grep -v '# agentic-os-routines$' | crontab -
  fi
  echo "Removed."
  exit 0
fi

echo "Unsupported system: $OS." >&2
exit 1
