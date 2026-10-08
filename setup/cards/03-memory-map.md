# Card 03 — Memory map

**Goal:** Claude can find any fact about their work in two hops: `MAP.md` → area file → real document.
Format and rules: `memory-map/README.md` and `memory-map/areas/_example.md`.

## Steps

1. **Off-limits first.** Before scanning anything, confirm the folders that must never be read
   (from card 01, topic 8). Write them as absolute paths in `os.config.json` → `off_limits`. Never list
   or open them, even to check.
2. **Where things live.** Ask which folders hold their work (e.g. `~/Documents`, `~/Projects`,
   `~/Dropbox/Clients`). Scan only those, only 2–3 levels deep, skipping `node_modules`, `.git`, caches,
   and anything off-limits. Show what you found as a short list; ask what each unknown folder is.
3. **Areas.** From card 01 and the scan, propose 3–7 areas (id in kebab-case, short label). Assign
   colours in this fixed order (validated for colour-blind readability on the dark theme): `#3987e5`,
   `#d95926`, `#199e70`, `#c98500`, `#d55181`, `#008300`, `#8a63d2`, then `#77746d` for "Personal" or
   "Archive". Ask which areas should get a **session journal** (`journal: true`: when they finish a
   Claude Code session in a project of that area, a short summary of where they stopped is kept).
4. **Write the map:** `memory-map/MAP.md` (under 60 lines: Areas, Archive, Scan roots) and one
   `memory-map/areas/<id>.md` per area (under 80 lines) with the 6 sections in order: Projects, State,
   Skills, Memory, Routines, Not here. Each line: `- [name](absolute path or https URL): one-line note`.
   Old or paused things go to `memory-map/archive.md`. Every fact has one home: the map only points.
5. **Add areas to** `os.config.json` → `areas` (`id`, `label`, `color`, `journal`).
   These ids are reused everywhere: if the Projects page is kept (card 04), card 05 creates `projects/<id>.json`
   with the same ids so journals, ideas, milestones and colours line up.
6. **Check:** run `python3 memory-map/check.py` and fix every problem until it exits 0. Run
   `python3 routines/build_brain.py` so the brain shows their map.
7. Explain the two-hop idea in one sentence and show one example ("ask me where your invoices are").

## Done when
`check.py` passes, the brain builds, the user recognises their work in the areas. Next: card 04.
