#!/usr/bin/env bash
# Install the routine runner so it ticks every 5 minutes.
#   macOS: launchd user agent  ~/Library/LaunchAgents/com.agentic-os.routines.plist
#   Linux: systemd --user timer (agentic-os-routines.timer), or a crontab line when systemd --user is unavailable
# Prints what it will do and asks for confirmation first. Options: --dry-run (print only), --cron (force crontab on Linux).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PYTHON="$(command -v python3 || true)"
DRY_RUN=0; FORCE_CRON=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --cron) FORCE_CRON=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "$PYTHON" ]; then echo "python3 not found in PATH: install Python 3.10+ first." >&2; exit 1; fi
PATH_VALUE="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
render() { "$PYTHON" "$HERE/render.py" "$1" "$ROOT" "$PYTHON" "$PATH_VALUE" ${2:-}; }

confirm() {
  if [ "$DRY_RUN" = 1 ]; then echo; echo "(dry run: nothing installed)"; exit 0; fi
  printf '\nProceed? [y/N] '
  read -r answer || answer=""
  case "$answer" in y|Y|yes|YES) ;; *) echo "Cancelled, nothing changed."; exit 0 ;; esac
}

OS="$(uname -s)"
echo "Agentic OS scheduler"
echo "  OS folder : $ROOT"
echo "  python3   : $PYTHON"
echo "  runner    : $ROOT/routines/run.py, every 5 minutes"
echo "  log       : $ROOT/routines/scheduler.log"

if [ "$OS" = "Darwin" ]; then
  LABEL="com.agentic-os.routines"
  TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
  echo
  echo "This will:"
  echo "  1. write $TARGET"
  echo "  2. load it with: launchctl bootstrap gui/$(id -u) $TARGET"
  [ -f "$TARGET" ] && echo "  (an existing $TARGET will be replaced and reloaded)"
  echo
  echo "--- $TARGET ---"
  render "$HERE/$LABEL.plist.template" --xml
  confirm
  mkdir -p "$HOME/Library/LaunchAgents"
  launchctl bootout "gui/$(id -u)" "$TARGET" 2>/dev/null || true
  render "$HERE/$LABEL.plist.template" --xml > "$TARGET"
  launchctl bootstrap "gui/$(id -u)" "$TARGET"
  echo "Installed. Check with: launchctl print gui/$(id -u)/$LABEL | head"
  echo
  echo "Tip (optional, not run): routines only run while the Mac is awake. To have the morning digest ready,"
  echo "you can wake the Mac a few minutes before it, e.g. for a 07:30 digest:"
  echo "  sudo pmset repeat wakeorpoweron MTWRFSU 07:25:00"
  echo "(undo with: sudo pmset repeat cancel)"
  exit 0
fi

if [ "$OS" = "Linux" ]; then
  UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  if [ "$FORCE_CRON" = 0 ] && command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
    echo
    echo "This will:"
    echo "  1. write $UNIT_DIR/agentic-os-routines.service and agentic-os-routines.timer"
    echo "  2. run: systemctl --user daemon-reload && systemctl --user enable --now agentic-os-routines.timer"
    echo "  (to keep the timer running while you are logged out: loginctl enable-linger \$USER — not run here)"
    echo
    echo "--- agentic-os-routines.service ---"; render "$HERE/agentic-os-routines.service.template"
    echo "--- agentic-os-routines.timer ---";   render "$HERE/agentic-os-routines.timer.template"
    confirm
    mkdir -p "$UNIT_DIR"
    render "$HERE/agentic-os-routines.service.template" > "$UNIT_DIR/agentic-os-routines.service"
    render "$HERE/agentic-os-routines.timer.template" > "$UNIT_DIR/agentic-os-routines.timer"
    systemctl --user daemon-reload
    systemctl --user enable --now agentic-os-routines.timer
    echo "Installed. Check with: systemctl --user list-timers agentic-os-routines.timer"
    exit 0
  fi
  if ! command -v crontab >/dev/null 2>&1; then
    echo "Neither systemd --user nor crontab is available. See scheduler/README.md for manual options." >&2
    exit 1
  fi
  LINE="$(render "$HERE/cron.line.template")"
  echo
  echo "systemd --user is not available: using your crontab instead."
  echo "This will add (or replace) this line in your crontab:"
  echo "  $LINE"
  confirm
  { crontab -l 2>/dev/null | grep -v '# agentic-os-routines$' || true; echo "$LINE"; } | crontab -
  echo "Installed. Check with: crontab -l"
  exit 0
fi

echo "Unsupported system: $OS. See scheduler/README.md for manual options." >&2
exit 1
