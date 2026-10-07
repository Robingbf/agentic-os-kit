#!/usr/bin/env python3
"""Build dashboard/data/today.json: milestones, quarter grid, tasks per project, OS cost.

No AI, fast: called by the runner on every tick (every 5 minutes). Every input is optional.
Usage: python3 routines/build_today.py
"""
import json
import os
import re
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

GOALS = config.path("goals.json")
OUT = config.path("dashboard", "data", "today.json")
AREAS = config.path("memory-map", "areas")
SESSIONS = config.path("state", "sessions")
LINK = re.compile(r"^- \[([^\]]+)\]\((<[^>]+>|[^)\s<>]+)\):")
BOX = re.compile(r"^- \[( |x|X)\] (.+)$")  # top-level checkboxes
PAUSED = "⏸"
COST_LOGS = (  # (key, file, column holding the USD cost); every file is optional
    ("routines", ("routines", "runs.log"), 4),
    ("sessions", ("state", "sessions", "sessions.log"), 3),
    ("probe", ("state", "usage-probe.log"), 2),
    ("chat", ("state", "chat", "chat.log"), 2),
    ("mail", ("state", "mail-watch.log"), 2),
)


def now_local(cfg):
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(cfg.get("timezone") or "UTC"))
    except Exception:
        return datetime.now().astimezone()


def blocked(path, off_limits):
    p = os.path.realpath(path)
    return any(p == o or p.startswith(o.rstrip(os.sep) + os.sep) for o in off_limits)


def state_entries(area):
    """State entries of an area signpost: [(name, target)]."""
    out, section = [], None
    try:
        with open(os.path.join(AREAS, f"{area}.md"), encoding="utf-8") as f:
            for line in f:
                if line.startswith("## "):
                    section = line[3:].strip()
                elif section == "State" and (m := LINK.match(line)):
                    out.append((m.group(1), os.path.expanduser(m.group(2).strip("<>"))))
    except OSError:
        pass
    return out


def clean(text):
    """'**4. Brief pipeline** — details…' → '4. Brief pipeline'."""
    t = re.sub(r"[*`]", "", text).split(" — ")[0].strip()
    return t[:90] + ("…" if len(t) > 90 else "")


def journal(path):
    """Last session, stopping point and open tasks from a session journal (state/sessions/<area>.md)."""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None

    def sec(name):
        return text.split(f"## {name}\n", 1)[1].split("\n## ", 1)[0] if f"## {name}\n" in text else ""

    last = sec("Last session").strip().splitlines()
    head = last[0].split(" · ", 1) if last else ["", ""]
    return {"when": head[0], "summary": head[1] if len(head) > 1 else "",
            "stopped_at": next((ln.split(":", 1)[1].strip() for ln in last if ln.startswith("Stopped at")), ""),
            "open": [m.group(1) for m in re.finditer(r"(?m)^- \[ \] (.+)$", sec("Open tasks"))],
            "done": [m.group(1) for m in re.finditer(r"(?m)^- \[x\] (.+)$", sec("Done recently"))],
            "history": [{"when": m.group(1), "summary": m.group(2)}
                        for m in re.finditer(r"(?m)^- (\d{4}-\d\d-\d\d \d\d:\d\d) · (.+)$", sec("History"))][:6]}


def os_cost(now, days=30):
    """Estimated OS cost (routines, session summaries, probes, chat, mail) over the last `days` days, in USD."""
    since = (now - timedelta(days=days)).replace(tzinfo=None).isoformat()
    total = {key: 0.0 for key, _, _ in COST_LOGS}
    for key, parts, col in COST_LOGS:
        try:
            with open(config.path(*parts), encoding="utf-8") as f:
                for line in f:
                    p = line.rstrip("\n").split("\t")
                    if len(p) > col and p[0][:19] >= since[:19]:
                        try:
                            total[key] += float(p[col] or 0)
                        except ValueError:
                            pass
        except OSError:
            pass
    return {k: round(v, 2) for k, v in total.items()}


def project(area, label, milestones, off_limits):
    tasks, done, total, sources = [], 0, 0, []
    jour_path = os.path.join(SESSIONS, f"{area}.md")
    for name, target in state_entries(area):
        if target.startswith("https://"):
            sources.append({"label": name, "url": target})
            continue
        if not target.startswith("/") or blocked(target, off_limits):
            continue
        if os.path.realpath(os.path.dirname(target)) == os.path.realpath(SESSIONS):
            jour_path = target  # the session journal is listed in State
            continue
        if target.endswith(".md") and os.path.isfile(target):
            sources.append({"label": os.path.basename(target), "path": target})
            with open(target, encoding="utf-8") as f:
                for line in f:
                    if (m := BOX.match(line.rstrip("\n"))):
                        total += 1
                        if m.group(1) != " ":
                            done += 1
                        else:
                            tasks.append({"text": clean(m.group(2)), "paused": PAUSED in m.group(2), "file": os.path.basename(target)})
    stones = [m for m in milestones if m.get("area") == area]
    return {"area": area, "label": label, "milestones": stones, "tasks": tasks, "done": done, "total": total,
            "sources": sources, "journal": journal(jour_path)}


def quarter_grid(today, window_start, window_days, milestone_dates):
    """4 rows (Q1–Q4) of 13 weeks; each cell: state, milestone, inside the goal window."""
    jan1 = date(today.year, 1, 1)
    start = jan1 - timedelta(days=jan1.weekday())  # Monday of the week holding January 1st
    w_end = window_start + timedelta(days=window_days) if window_start else None
    rows = []
    for q in range(4):
        cells = []
        for i in range(13):
            mon = start + timedelta(weeks=q * 13 + i)
            sun = mon + timedelta(days=6)
            cells.append({
                "monday": mon.isoformat(),
                "state": "current" if mon <= today <= sun else ("past" if sun < today else "future"),
                "milestone": any(mon <= d <= sun for d in milestone_dates),
                "window": bool(window_start) and mon <= w_end and sun >= window_start,
            })
        rows.append(cells)
    return rows


def load_goals():
    try:
        with open(GOALS, encoding="utf-8") as f:
            goals = json.load(f)
        return goals if isinstance(goals, dict) else {}
    except (OSError, ValueError):
        return {}


def parse_date(value):
    try:
        return date.fromisoformat(value) if value else None
    except (TypeError, ValueError):
        return None


def main():
    cfg = config.load()
    now = now_local(cfg)
    today = now.date()
    goals = load_goals()
    ws = parse_date(goals.get("window_start"))
    try:
        window_days = int(goals.get("window_days") or 90)
    except (TypeError, ValueError):
        window_days = 90
    milestones = []
    for m in goals.get("milestones") or []:
        if not isinstance(m, dict):
            continue
        d = parse_date(m.get("date"))
        milestones.append({**m, "days_left": (d - today).days if d else None})
    upcoming = [m for m in milestones if m["days_left"] is not None and m["days_left"] >= 0]
    gate = min((m for m in upcoming if m.get("gate")), key=lambda m: m["days_left"], default=None)
    dates = [d for d in (parse_date(m.get("date")) for m in milestones) if d]
    off_limits = [os.path.realpath(p) for p in cfg.get("off_limits", [])]
    areas = [a for a in cfg.get("areas", []) if isinstance(a, dict) and a.get("id") and a.get("journal")]

    data = {
        "updated_at": now.isoformat(timespec="seconds"),
        "week": today.isocalendar()[1],
        "gate": gate,
        "milestones": milestones,
        "window": {"start": ws.isoformat(), "end": (ws + timedelta(days=window_days)).isoformat()} if ws else {"start": None, "end": None},
        "projects": [project(a["id"], a.get("label") or a["id"], milestones, off_limits) for a in areas],
        "os_cost_30d": os_cost(now),
        "quarters": quarter_grid(today, ws, window_days, dates),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(OUT + ".tmp", OUT)
    print(f"today.json: {len(milestones)} milestones, {len(data['projects'])} projects")


if __name__ == "__main__":
    main()
