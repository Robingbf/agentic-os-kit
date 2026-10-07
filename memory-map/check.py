#!/usr/bin/env python3
"""Check the memory map. Exits with code 1 on any problem.

Rules (see memory-map/README.md): link format, the 6 area sections in order, one home per fact
(no duplicates), no orphan folder under the scan roots, line limits (MAP 60, areas 80).
Paths listed under `off_limits` in os.config.json are never scanned nor printed.
Usage: python3 memory-map/check.py
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "routines"))
import config  # noqa: E402

MAP = os.path.join(HERE, "MAP.md")
ARCHIVE = os.path.join(HERE, "archive.md")
SECTIONS = ["Projects", "State", "Skills", "Memory", "Routines", "Not here"]
MAP_SECTIONS = ["Areas", "Archive", "Scan roots"]
MAP_MAX, AREA_MAX, ARCHIVE_MAX = 60, 80, 200
LINK = re.compile(r"^- \[([^\]]+)\]\((<[^>]+>|[^)\s<>]+)\):(.*)$")

OFF_LIMITS = [os.path.realpath(p) for p in config.load().get("off_limits", [])]
problems = []


def rel(path):
    return os.path.relpath(path, os.path.dirname(HERE)) if path.startswith(os.path.dirname(HERE) + os.sep) else path


def blocked(path):
    p = os.path.realpath(path)
    return any(p == o or p.startswith(o.rstrip(os.sep) + os.sep) for o in OFF_LIMITS)


def parse(path, max_lines):
    """Return ({section: [(line, target)]}, ordered section names). HTML comments are ignored."""
    sections, order, current, in_comment = {}, [], None, False
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    if len(lines) > max_lines:
        problems.append(f"{rel(path)}: {len(lines)} lines (max {max_lines})")
    for n, line in enumerate(lines, 1):
        if in_comment or line.lstrip().startswith("<!--"):
            in_comment = "-->" not in line
            continue
        if line.startswith("## "):
            current = line[3:].strip()
            order.append(current)
            sections[current] = []
        elif line.startswith("- "):
            m = LINK.match(line)
            if not m:
                problems.append(f"{rel(path)}:{n}: expected format '- [name](absolute path or https://…): note'")
                continue
            target = os.path.expanduser(m.group(2).strip("<>"))
            if target.startswith("https://"):
                pass  # web link: nothing to check locally
            elif not target.startswith("/"):
                problems.append(f"{rel(path)}:{n}: path is not absolute: {target}")
                continue
            elif blocked(target):
                problems.append(f"{rel(path)}:{n}: points inside an off_limits path (remove this line)")
                continue
            elif not os.path.exists(target):
                problems.append(f"{rel(path)}:{n}: path not found: {target}")
            sections.setdefault(current, []).append((n, target))
    return sections, order


if not os.path.exists(MAP):
    print(f"ERROR: {rel(MAP)} not found")
    sys.exit(1)

master, master_order = parse(MAP, MAP_MAX)
if master_order != MAP_SECTIONS:
    problems.append(f"{rel(MAP)}: sections {master_order}, expected {MAP_SECTIONS}")

if not master.get("Areas") and not problems:
    print("map is empty — run the setup (setup/START.md) to add your areas")
    sys.exit(0)

listed = {}  # path -> first occurrence, for the "one home per fact" rule


def record(path, entries):
    for n, target in entries:
        # Pointers to other files of the map are not facts.
        if target.startswith(HERE + os.sep) and target.endswith(".md"):
            continue
        if target in listed:
            problems.append(f"{rel(path)}:{n}: {target} already listed in {listed[target]}")
        else:
            listed[target] = f"{rel(path)}:{n}"


for _, area in master.get("Areas", []):
    if not os.path.isfile(area):
        continue
    secs, order = parse(area, AREA_MAX)
    if order != SECTIONS:
        problems.append(f"{rel(area)}: sections {order}, expected {SECTIONS}")
    for entries in secs.values():
        record(area, entries)

archives = [a for _, a in master.get("Archive", []) if os.path.isfile(a)]
if os.path.isfile(ARCHIVE) and ARCHIVE not in archives:
    archives.append(ARCHIVE)
for archive in archives:
    secs, _ = parse(archive, ARCHIVE_MAX)
    for entries in secs.values():
        record(archive, entries)

for _, root in master.get("Scan roots", []):
    if not os.path.isdir(root) or blocked(root):
        continue
    for name in sorted(os.listdir(root)):
        child = os.path.join(root, name)
        if name.startswith(".") or not os.path.isdir(child) or blocked(child):
            continue
        if child not in listed:
            problems.append(f"orphan (in no area nor archive): {child}")

for p in problems:
    print(p)
print(f"{len(problems)} problem(s)" if problems else "OK: memory map is consistent")
sys.exit(1 if problems else 0)
