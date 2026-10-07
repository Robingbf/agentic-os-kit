# Card 07 — Dashboard

**Goal:** their dashboard runs, shows their things, looks the way they like.

## Steps

1. Build the data once: `python3 routines/build_today.py`, `python3 routines/build_brain.py`,
   `python3 memory-map/check.py`, and run the routines that feed custom pages if they have not run yet.
2. Start the server: `python3 dashboard/server.py` (keep it running in its own terminal tab, or explain
   how). Open http://127.0.0.1:<port> (default 8765). If a browser tool is available, look at it yourself
   first and fix layout or console errors before showing it.
3. **Walk them through it**, left to right, in plain words: Today, the panels they enabled, the brain and
   its views (rings = skills, memory, routines, apps around their areas), their pages, the skills deck,
   routines, the top bar (runner, map check, computer health, Claude quota, "/" search and chat, ⚙ costs).
4. **Adjust** with them: accent colour (`dashboard.accent`), area colours (click the colour dot on an area
   chip in the brain), page order, which panels stay. Each change: edit `os.config.json`, reload the page.
5. **Mail plan** (only if enabled in the blueprint): the "File · <label>" buttons need the labels to exist
   in their mailbox. Offer to create the missing labels — **only with an explicit yes**, labels only. Never
   move, label, archive or delete existing emails during setup.
6. Show the "/" palette: search files, and ✦ Claude chat (can read their files, edit only inside the OS
   folder).

## Done when
They have seen every part and said what to change; changes are applied. Next: card 08.
