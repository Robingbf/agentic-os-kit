#!/usr/bin/env python3
"""Apply the filing option the user picked for a captured note (no AI, deterministic).

Parameters (env var AOS_PARAMS, validated by the server and by run.py): {"id": "<note id>", "choice": "<option index>"}
Writes only to: area journals (state/sessions/<area>.md), idea files (state/ideas/<area>.md), and the .md files
listed in the Memory or State sections of the memory map (memory-map/areas/<id>.md).
"""
import json
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

INBOX = config.path("state", "inbox")
SESSIONS = config.path("state", "sessions")
IDEAS = config.path("state", "ideas")
AREAS = config.path("memory-map", "areas")
LINK = re.compile(r"^- \[[^\]]+\]\((<[^>]+>|[^)\s<>]+)\):")
OPEN_TASKS = "Open tasks"   # same heading as hooks/session_journal.py


def link_path(raw):
    """Path of a memory-map link: absolute, ~/..., or relative to the OS folder."""
    p = os.path.expanduser(raw.strip("<>"))
    return p if os.path.isabs(p) else config.path(p)


def allowed_files():
    """Existing .md files listed in the Memory/State sections of the memory map."""
    out = set()
    if not os.path.isdir(AREAS):
        return out
    for fn in os.listdir(AREAS):
        if not fn.endswith(".md"):
            continue
        section = None
        with open(os.path.join(AREAS, fn), encoding="utf-8") as f:
            for line in f:
                if line.startswith("## "):
                    section = line[3:].strip()
                elif section in ("Memory", "State") and (m := LINK.match(line)):
                    p = link_path(m.group(1))
                    if p.endswith(".md") and os.path.isfile(p):
                        out.add(os.path.realpath(p))
    return out


def insert_under(path, heading, line, title):
    """Add `line` under `## heading` (created at the end when missing)."""
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            text = f.read()
    else:
        text = f"# {title}\n"
    if f"## {heading}\n" in text:
        head, rest = text.split(f"## {heading}\n", 1)
        text = f"{head}## {heading}\n{line}\n{rest}"
    else:
        text = text.rstrip("\n") + f"\n\n## {heading}\n{line}\n"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(path + ".tmp", path)


def main():
    params = json.loads(os.environ.get("AOS_PARAMS") or "{}")
    nid = str(params.get("id", ""))
    try:
        choice = int(params.get("choice", "0"))
    except ValueError:
        sys.exit("invalid option")
    path = os.path.join(INBOX, f"{nid}.json")
    if not re.fullmatch(r"\d{8}T\d{6}-[0-9a-f]{6}", nid) or not os.path.exists(path):
        sys.exit("note not found")
    with open(path, encoding="utf-8") as f:
        note = json.load(f)
    tri = note.get("triage") or {}
    opts = tri.get("options") or []
    if not 0 <= choice < len(opts):
        sys.exit("unknown option")
    opt, area = opts[choice], tri.get("area")
    areas = set(config.area_ids())
    line = str(opt.get("line") or tri.get("title") or note["text"]).replace("\n", " ").strip()[:300]
    day = datetime.now().date().isoformat()
    kind, target = opt.get("type"), None
    if kind == "journal" and area in areas:
        target = os.path.join(SESSIONS, f"{area}.md")
        insert_under(target, OPEN_TASKS, f"- [ ] {line}", f"Journal · {area}")
    elif kind == "ideas" and area in areas:
        target = os.path.join(IDEAS, f"{area}.md")
        insert_under(target, "Ideas", f"- {line} (captured {day})", f"Ideas · {area}")
    elif kind == "file" and os.path.realpath(str(opt.get("path", ""))) in allowed_files():
        target = os.path.realpath(opt["path"])
        insert_under(target, "Inbox", f"- [ ] {line} (captured {day})", os.path.basename(target))
    note["status"] = "applied" if target else "manual"
    note["applied"] = {"choice": choice, "type": kind, "target": target, "at": datetime.now().astimezone().isoformat(timespec="seconds")}
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(note, f, ensure_ascii=False, indent=1)
    os.replace(path + ".tmp", path)
    print(f"{nid} -> {target or 'to do by hand: ' + str(opt.get('label'))}")


if __name__ == "__main__":
    main()
