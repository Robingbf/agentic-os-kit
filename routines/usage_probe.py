#!/usr/bin/env python3
"""Read the Claude subscription quota (5-hour and 7-day windows) -> state/usage.json.

Source: the `rate_limit_event` that `claude -p --output-format stream-json` emits on every call. Every session the
OS starts records it for free; when the last reading is stale, a minimal probe is sent (Haiku, no tools, no MCP,
no user settings): about $0.005 at public API prices, included in a subscription.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

OUT = config.path("state", "usage.json")
LOG = config.path("state", "usage-probe.log")
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
PROBE = [CLAUDE, "-p", "ok", "--model", "haiku", "--max-turns", "1",
         "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--disable-slash-commands",
         "--tools", "", "--setting-sources", "project"]


def record(lines, source):
    """Extract the quota from a stream-json output and store it. Returns the call's cost (USD)."""
    windows, cost = None, 0
    for line in lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "rate_limit_event":
            windows = (d.get("rate_limit_info") or {}).get("unifiedWindows")
        elif d.get("type") == "result":
            cost = d.get("total_cost_usd") or 0
    if windows:
        conv = lambda w: {"used_percentage": round((w.get("utilization") or 0) * 100, 1), "resets_at": w.get("resetsAt")} if w else None
        data = {"updated_at": datetime.now().astimezone().isoformat(timespec="seconds"), "source": source,
                "five_hour": conv(windows.get("five_hour")), "seven_day": conv(windows.get("seven_day"))}
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT + ".tmp", "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(OUT + ".tmp", OUT)
    return cost


def age_minutes():
    try:
        return (datetime.now().timestamp() - os.path.getmtime(OUT)) / 60
    except OSError:
        return 1e9


def main(force=False, max_age=15):
    cfg = config.load()
    if cfg.get("claude_plan") == "api" or not os.path.exists(CLAUDE):
        return  # pay-as-you-go API has no subscription quota; or Claude Code is not installed
    hour = datetime.now().hour
    if not force and (age_minutes() < max_age or 1 <= hour < 7):  # fresh enough, or night time: nothing to do
        return
    try:
        p = subprocess.run(PROBE, capture_output=True, text=True, timeout=90, cwd=tempfile.gettempdir(),
                           stdin=subprocess.DEVNULL, env={**os.environ, "AOS_JOURNAL": "1"})
    except (subprocess.TimeoutExpired, OSError):
        return
    cost = record(p.stdout.splitlines(), "probe")
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')}\tusage-probe\t{round(cost, 4)}\n")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
