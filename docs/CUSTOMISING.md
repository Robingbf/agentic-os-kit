# Customising your OS

The easiest way: open `claude` in the OS folder and ask in plain words. Claude follows the conventions
below (they are also summarised in `CLAUDE.md`).

## Show or hide a panel
`os.config.json` → `panels` → `true` / `false` (today, next_days, inbox, capture, waiting, skills,
routines). Reload the page.

## Today widgets and clocks
`today.widgets` (order matters): `clock`, `clocks`, `goal`, `quarters`. Extra clocks:
`"clocks": [{"label": "Tokyo", "tz": "Asia/Tokyo"}]`. Milestones: `goals.json`.

## Add a page
1. Add it to `pages` in `os.config.json`:
   `{"id": "clients", "title": "Clients", "kind": "custom", "icon": "users"}` (any Phosphor icon name).
2. Create a routine that writes `dashboard/data/page-clients.json` with `sections` of type `kpis`,
   `list`, `chart`, `table`, `text` (format: `docs/ARCHITECTURE.md`). Ask Claude: "add a Clients page fed
   every morning from my clients folder and my mail".

## Add a routine
Prompt in `routines/prompts/custom/<name>.md`, entry in `routines/registry.json` (schedule, model,
`allowed_tools` read-only, `max_turns`, `timeout_seconds`, `output`, optional `deck: true`,
`description`). Test it once with ▶ in the skills deck (or the Routines panel), check
`routines/runs.log` and the cost in ⚙ Settings.

## Add a skill
`.claude/skills/<name>/SKILL.md` with `name` + a `description` that says when to use it. To get a ▶ in the
skills deck, add an on-demand routine (`schedule: null`, `deck: true`) that runs it.

## Colours and look
`dashboard.accent` (main colour), area colours in `areas[].color` or by clicking the colour dot of an area
in the brain (saved in `state/prefs.json`). The CSS lives in `dashboard/index.html` (variables at the top).

## Brain rings
`brain.rings` = order of the rings around your areas, from the centre: `skills`, `memory`, `routines`,
`apps`. Remove one to hide it.

## Mail filing
`mail.enabled: true`, `mail.labels` (exact names as in your mailbox + a one-line description each),
`mail.fallback_by_area`. The digest and the mail watch then propose a "File · <label>" button on each
mail; nothing happens without your click.

## Update the kit
Your personal files are git-ignored, so `git pull` updates the code without touching your setup. Read
the release notes first; if a pull conflicts with a file you edited, ask Claude to merge it.
