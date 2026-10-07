#!/usr/bin/env python3
"""Claude Code status line: shows the remaining quota and records it for the dashboard (state/usage.json).

On every refresh Claude Code sends a JSON object on stdin; `rate_limits` (5-hour and 7-day windows) is only
present for Pro/Max subscriptions, and only after the session's first answer.
"""
import json
import os
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "state", "usage.json")


def main():
    try:
        data = json.load(sys.stdin)
    except ValueError:
        data = {}
    rl = data.get("rate_limits") or {}
    five, week = rl.get("five_hour") or {}, rl.get("seven_day") or {}
    if five or week:
        record = {"updated_at": datetime.now().astimezone().isoformat(timespec="seconds"), "source": "statusline",
                  "five_hour": five or None, "seven_day": week or None,
                  "model": (data.get("model") or {}).get("display_name")}
        try:
            os.makedirs(os.path.dirname(OUT), exist_ok=True)
            with open(OUT + ".tmp", "w", encoding="utf-8") as f:
                json.dump(record, f)
            os.replace(OUT + ".tmp", OUT)
        except OSError:
            pass
    pct = lambda w: f"{round(w['used_percentage'])}%" if w.get("used_percentage") is not None else "–"
    model = (data.get("model") or {}).get("display_name") or ""
    print(f"{model} · 5h {pct(five)} · week {pct(week)}" if (five or week) else model)


if __name__ == "__main__":
    main()
