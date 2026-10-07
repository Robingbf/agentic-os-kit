# Memory map

The memory map tells Claude (and the dashboard brain) **where** things live, so a session never
has to search the whole disk. It holds pointers, not content.

## Files

- `MAP.md`: the master signpost. Three sections, in this order: `Areas`, `Archive`, `Scan roots`.
  At most 60 lines.
- `areas/<area-id>.md`: one signpost per area (the id matches `os.config.json` → `areas[].id`).
  Six sections, always present and in this order: `Projects`, `State`, `Skills`, `Memory`,
  `Routines`, `Not here`. At most 80 lines. See `areas/_example.md`.
- `archive.md` (optional): finished or paused things, same line format.
- `check.py`: validates everything below; exits non-zero on any problem. Runs nightly.

## Line format

```
- [name](/absolute/path or https://url): short note
```

Paths are absolute (use `<…>` around a path containing spaces). Web links are allowed but not
checked. Folders listed under `Memory`, `State` or `Skills` are expanded by the brain builder
(`.md` files and `SKILL.md` folders, three levels deep).

## Rules

- **Two-hop rule**: any fact is reachable in at most two hops: `MAP.md` → area file → the file
  that holds the fact. If you need a third hop, add a line to the area file instead.
- **One home per fact**: a path appears in one area (or the archive) only. Other areas point to
  that area under `Not here`; `check.py` reports duplicates.
- **No orphans**: every direct sub-folder of a `Scan roots` folder is listed somewhere.
- **Off-limits stay off**: paths in `os.config.json` → `off_limits` are never listed, scanned
  nor reported.
