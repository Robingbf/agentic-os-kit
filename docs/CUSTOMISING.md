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

## Projects page
A base to adapt, not a fixed method. Its vocabulary lives in `os.config.json` → `projects` (defaults in
`os.config.example.json`); the server validates every edit against the same lists.

- **Rename** a status, a task column or an importance level: change its `label` (keep the `id`, it is what the
  project files store). Status icons are Phosphor names (`icon`), importance levels have a `color`.
- **Add or remove columns**: edit `projects.columns`, in display order. A creator could use
  `[{"id":"inbox","label":"Ideas"},{"id":"script","label":"Script"},{"id":"shoot","label":"Shoot"},{"id":"edit","label":"Edit"},{"id":"publish","label":"Publish"},{"id":"done","label":"Published"}]`.
  Tasks still sitting in a removed column show up in the first column, and an importance that no longer exists
  becomes the default one (`medium`, or the middle level); the project file is updated the next time it is saved.
- Two ids keep a meaning: the **first status** is the ideas stage (projects there get an idea sheet, and the second
  status is where "Move to …" sends them); the column with id **`done`** means completed (progress bars, recently
  done, the ✓ button). New tasks from session journals and ideas land in the **first column**; the board's "Next
  tasks" are taken from `doing` then `todo` when those ids exist (otherwise from every open column but the first).
- **Importance**: in order from least to most important; the last level gets a badge on its cards.
- **Remove the page**: delete `{ "id": "projects" }` from `pages`. The files in `projects/` stay; nothing else depends on them.

Project files: `projects/<id>.json` (format in `CLAUDE.md`). Use the area id as project id so session journals
(`state/sessions/<id>.md`), captured ideas (`state/ideas/<id>.md`), milestones (`goals.json`, `area`) and colours
follow automatically. Deleting an idea moves its file to `state/projects-deleted/`.

## Add a routine
Prompt in `routines/prompts/custom/<name>.md`, entry in `routines/registry.json` (schedule, model,
`allowed_tools` read-only, `max_turns`, `timeout_seconds`, `output`, optional `deck: true`,
`description`). Once it exists, the ✎ button on its skills-deck tile opens its sheet: name, description, schedule,
model and prompt can be edited there (allowed tools stay read-only; the previous prompt is kept in `state/md-backups/`). Test it once with ▶ in the skills deck (or the Routines panel), check
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
