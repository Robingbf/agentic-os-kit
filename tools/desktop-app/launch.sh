#!/usr/bin/env bash
# Opens the dashboard as an app window without building anything: starts the server if needed,
# then opens it in Chrome/Chromium/Edge "app mode" (no tabs, no address bar), or the default browser.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="$(python3 -c "import sys; sys.path.insert(0, '$ROOT/routines'); import config; print(config.load().get('dashboard', {}).get('port') or 8765)")"
URL="http://127.0.0.1:$PORT/"
if ! curl -s -m 1 -o /dev/null "${URL}health"; then
  mkdir -p "$ROOT/state"
  (cd "$ROOT" && nohup python3 dashboard/server.py >"$ROOT/state/desktop-server.log" 2>&1 &)
  for _ in $(seq 1 40); do curl -s -m 1 -o /dev/null "${URL}health" && break; sleep 0.25; done
fi
for b in google-chrome chromium chromium-browser microsoft-edge; do
  command -v "$b" >/dev/null && exec "$b" --app="$URL"
done
if [ "$(uname -s)" = "Darwin" ]; then
  for a in "Google Chrome" "Microsoft Edge" "Chromium"; do
    [ -d "/Applications/$a.app" ] && exec open -na "$a" --args --app="$URL"
  done
  exec open "$URL"
fi
exec xdg-open "$URL"
