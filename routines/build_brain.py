#!/usr/bin/env python3
"""Build dashboard/data/brain.json from the memory map, the routine registry and the run log.

Only reads what the map lists (plus the registry, the run log and Claude Code skill folders):
no free scan of the disk. Paths listed under `off_limits` in os.config.json are never read.
Usage: python3 routines/build_brain.py
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

MAP = config.path("memory-map", "MAP.md")
REGISTRY = config.path("routines", "registry.json")
LOG = config.path("routines", "runs.log")
OUT = config.path("dashboard", "data", "brain.json")
SKILL_DIRS = [config.path(".claude", "skills"), os.path.expanduser("~/.claude/skills")]
RUN_DAYS = 60  # older runs are ignored
APP_MARKERS = ("package.json", "app.json", "project.yml", "pubspec.yaml", "Cargo.toml", "pyproject.toml", ".git")
SKIP_DIRS = {"node_modules", ".git", "build", "dist", ".next", ".expo", "DerivedData", "vendor", "__pycache__", ".venv"}
EXPAND_DEPTH = 3  # how deep listed folders (Memory, State, Skills) are expanded
OS_AREA = "os"    # pseudo-area holding the OS itself: routines, runs, Claude Code skills
DEFAULT_RINGS = ["skills", "memory", "routines", "apps"]
RING_LABELS = {"skills": "Skills", "memory": "Memory", "routines": "Routines", "apps": "Applications"}
KIND_ICON = {"project": "folder-simple", "app": "app-window", "archive": "archive"}  # Phosphor icon names

LINK = re.compile(r"^- \[([^\]]+)\]\((<[^>]+>|[^)\s<>]+)\):(.*)$")
SECTION_KIND = {
    "Projects": ("project", "apps"),
    "State": ("memory", "memory"),
    "Skills": ("skill", "skills"),
    "Memory": ("memory", "memory"),
    "Routines": ("routine", "routines"),
    "Not here": ("note", "memory"),
}

nodes, links, seen = {}, [], set()
OFF_LIMITS = []


def blocked(path):
    if not path or path.startswith("https://"):
        return False
    p = os.path.realpath(os.path.expanduser(path))
    return any(p == o or p.startswith(o.rstrip(os.sep) + os.sep) for o in OFF_LIMITS)


def mtime(path):
    try:
        return datetime.fromtimestamp(os.stat(path).st_mtime).astimezone().isoformat(timespec="seconds")
    except OSError:
        return None


def add(nid, kind, label, area, layer, path=None, note=""):
    if nid not in nodes:
        nodes[nid] = {"id": nid, "kind": kind, "label": label, "area": area, "layer": layer,
                      "path": path, "note": (note or "").strip(),
                      "changed": mtime(path) if path and path.startswith("/") else None}
    return nid


def link(s, t):
    if s != t and (s, t) not in seen and (t, s) not in seen:
        seen.add((s, t))
        links.append({"s": s, "t": t})


def parse(path):
    """[(section, label, target, note)] for every '- [name](target): note' line."""
    out, section = [], None
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                if line.startswith("## "):
                    section = line[3:].strip()
                elif (m := LINK.match(line)):
                    out.append((section, m.group(1), os.path.expanduser(m.group(2).strip("<>")), m.group(3)))
    except OSError:
        pass
    return out


def walk(base, want):
    """Files under `base` (limited depth) for which want(folder, name) is true."""
    out = []
    base_depth = base.rstrip(os.sep).count(os.sep)
    for d, dirs, files in os.walk(base):
        if blocked(d):
            dirs[:] = []
            continue
        dirs[:] = sorted(x for x in dirs if not x.startswith(".") and x not in SKIP_DIRS)
        if d.count(os.sep) - base_depth >= EXPAND_DEPTH:
            dirs[:] = []
        out += [os.path.join(d, f) for f in sorted(files) if want(d, f)]
    return out


def skill_info(skill_md):
    """(name, description) from a SKILL.md front matter."""
    name, desc = os.path.basename(os.path.dirname(skill_md)), ""
    try:
        with open(skill_md, encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i > 40:
                    break
                if line.startswith("name:"):
                    name = line.split(":", 1)[1].strip().strip("'\"") or name
                elif line.startswith("description:"):
                    desc = line.split(":", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return name, desc[:200]


def logo_url(value):
    """Area logo from config (a PNG path inside the kit) → URL served by the dashboard, or None."""
    if not value or not isinstance(value, str):
        return None
    p = os.path.realpath(value if os.path.isabs(value) else config.path(value))
    dash = os.path.realpath(config.path("dashboard"))
    if not p.startswith(dash + os.sep) or not p.lower().endswith(".png") or not os.path.isfile(p):
        return None
    return "/" + os.path.relpath(p, dash).replace(os.sep, "/")


def main():
    cfg = config.load()
    OFF_LIMITS[:] = [os.path.realpath(p) for p in cfg.get("off_limits", [])]
    areas_cfg = {a["id"]: a for a in cfg.get("areas", []) if isinstance(a, dict) and a.get("id")}
    rings = [r for r in ((cfg.get("brain") or {}).get("rings") or []) if isinstance(r, str)] or DEFAULT_RINGS

    root = add("root", "root", "MAP.md", "core", "core", MAP if os.path.exists(MAP) else None, "Master file of the memory map")
    area_of_file = {}

    # Areas and archive
    for section, label, target, note in parse(MAP):
        if blocked(target) or not target.startswith("/"):
            continue
        if section == "Areas":
            area = os.path.splitext(os.path.basename(target))[0]
            area_of_file[target] = area
            label = areas_cfg.get(area, {}).get("label") or label
            link(root, add(f"area:{area}", "area", label, area, "core", target, note))
        elif section == "Archive":
            area_of_file[target] = "archive"
            link(root, add("area:archive", "area", label, "archive", "core", target, note))

    # The OS itself
    claude_md = config.path("CLAUDE.md")
    link(root, add(f"area:{OS_AREA}", "area", "OS", OS_AREA, "core", claude_md if os.path.exists(claude_md) else None,
                   "This kit: routines, runs and Claude Code skills"))

    # Content of each area file
    for file, area in area_of_file.items():
        if not os.path.exists(file):
            continue
        logo = logo_url(areas_cfg.get(area, {}).get("logo"))
        for section, label, target, note in parse(file):
            if blocked(target):
                continue
            if target in area_of_file:  # pointer to another area: a link, not a node
                link(f"area:{area}", f"area:{area_of_file[target]}")
                continue
            kind, layer = SECTION_KIND.get(section, ("project", "apps"))
            if kind == "project" and os.path.isdir(target) and any(os.path.exists(os.path.join(target, m)) for m in APP_MARKERS):
                kind = "app"
            nid = add(target, kind, label, area, layer, target, note)
            link(f"area:{area}", nid)
            if kind in ("project", "app"):
                nodes[nid].update({"logo": logo} if logo else {"icon": KIND_ICON["archive" if area == "archive" else kind]})
            # The brain follows the content: listed folders are expanded.
            if os.path.isdir(target) and section in ("Memory", "State"):
                for f in walk(target, lambda d, n: n.endswith(".md")):
                    link(nid, add(f, "memory", os.path.relpath(f, target), area, "memory", f))
            elif os.path.isdir(target) and section == "Skills" and not os.path.exists(os.path.join(target, "SKILL.md")):
                for f in walk(target, lambda d, n: n == "SKILL.md"):
                    name, desc = skill_info(f)
                    link(nid, add(os.path.dirname(f), "skill", name, area, "skills", os.path.dirname(f), desc))

    # Claude Code skills (project level, then user level)
    for d in SKILL_DIRS:
        if not os.path.isdir(d) or blocked(d):
            continue
        for f in walk(d, lambda _d, n: n == "SKILL.md"):
            sid = os.path.dirname(f)
            if sid not in nodes:
                name, desc = skill_info(f)
                link(f"area:{OS_AREA}", add(sid, "skill", name, OS_AREA, "skills", sid, desc))

    # Registry routines and their runs
    try:
        with open(REGISTRY, encoding="utf-8") as f:
            reg = json.load(f)
    except (OSError, ValueError):
        reg = {}
    for r in reg.get("routines", []):
        if not isinstance(r, dict) or not r.get("name"):
            continue
        src = None
        if r.get("prompt_file"):
            src = config.path("routines", r["prompt_file"])
        elif r.get("command"):
            src = config.expand(r["command"][-1])
            src = src if os.path.isabs(src) else None
        note = " · ".join(x for x in (r.get("label"), r.get("schedule") or "manual", r.get("machine")) if x)
        rid = add(f"routine:{r['name']}", "routine", r["name"], OS_AREA, "routines", src, note)
        link(rid, f"area:{OS_AREA}")
        if src in nodes:
            link(rid, src)
    since = datetime.now() - timedelta(days=RUN_DAYS)
    try:
        with open(LOG, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        lines = []
    for line in lines:
        p = line.rstrip("\n").split("\t")
        if len(p) == 6:  # older format, without duration
            p = p[:5] + [""] + p[5:]
        if len(p) != 7:
            continue
        try:
            when = datetime.fromisoformat(p[0])
        except ValueError:
            continue
        if when.tzinfo is not None:
            when = when.astimezone().replace(tzinfo=None)
        if when < since:
            continue
        t, name, model, turns, cost, duration, status = p
        nid = add(f"run:{t}:{name}", "run", f"{name} {t[5:16].replace('T', ' ')}", OS_AREA, "runs",
                  None, f"{status} · {model} · {turns} turns · ${cost}" + (f" · {duration} s" if duration else ""))
        nodes[nid]["changed"] = datetime.fromisoformat(t).astimezone().isoformat(timespec="seconds")
        nodes[nid]["status"] = status
        link(nid, f"routine:{name}" if f"routine:{name}" in nodes else f"area:{OS_AREA}")

    # Ring order: configured rings first, then any other layer present (core and runs excluded).
    present = {n["layer"] for n in nodes.values()} - {"core", "runs"}
    ring_ids = rings + sorted(present - set(rings))
    live = set(nodes)
    area_list = [{"id": a, "label": c.get("label") or a, "color": c.get("color")}
                 for a, c in areas_cfg.items() if f"area:{a}" in live]
    area_list += [{"id": n["area"], "label": n["label"], "color": None}
                  for n in nodes.values() if n["kind"] == "area" and n["area"] not in areas_cfg]
    data = {
        "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "rings": [{"id": r, "label": RING_LABELS.get(r, r.replace("-", " ").title())} for r in ring_ids],
        "areas": area_list,
        "nodes": list(nodes.values()),
        "links": [x for x in links if x["s"] in live and x["t"] in live],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(OUT + ".tmp", OUT)
    print(f"brain.json: {len(data['nodes'])} nodes, {len(data['links'])} links")


if __name__ == "__main__":
    main()
