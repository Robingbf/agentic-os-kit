# Architecture

This kit is a personal **agentic OS** that runs on your own computer, on top of Claude Code and
your Claude subscription. It follows the four MAPS layers described by
[pavrus117/ai-os-maps-guide](https://github.com/pavrus117/ai-os-maps-guide) (Memory, Agent,
Pulse, Screen), and ships the code for three of them (Memory, Pulse, Screen) ready to be
personalised by a guided setup.

Nothing in the repository is about a specific person. Everything personal is produced by the
setup cards and lives in files that are **git-ignored**: `os.config.json`, `goals.json`,
`memory-map/areas/`, `interviews/`, `state/`, `dashboard/data/`, `routines/prompts/custom/`.

## Folder layout

```
CLAUDE.md                 rules for every Claude Code session opened in this folder (incl. setup mode)
os.config.example.json    template; setup writes os.config.json (git-ignored)
setup/                    the guided setup: START.md + cards/ + catalog/ (pages, routines, skills ideas)
memory-map/               MAP.md (master signpost), areas/<id>.md (one signpost per area), check.py
routines/                 registry.json, run.py (runner), prompts/, helpers (mcp_guard, usage_probe, …)
hooks/                    session_journal.py (SessionStart/SessionEnd), statusline.py
dashboard/                server.py (stdlib only, 127.0.0.1), index.html, app.js, brain.js, vendor/
scheduler/                launchd (macOS), systemd user timer (Linux), cron line; install script
tools/                    snapshot.py (nightly git snapshot), macsensors.c (optional macOS temps)
docs/                     this file, CUSTOMISING.md, SECURITY.md
```

All Python is **standard library only** (Python 3.10+). No build step, no npm, no framework.
Every path is resolved relative to the repository root (`ROOT`), so the folder can live anywhere.

## os.config.json (single source of personalisation)

```jsonc
{
  "setup_complete": false,
  "name": "My OS",                    // shown top-left of the centre column
  "tagline": "Agentic OS",
  "language": "en",                   // language of prompts, digest, journals (UI labels stay English unless translated)
  "timezone": "Europe/Paris",
  "machine": "my-laptop",             // hostname that runs routines (registry entries can target it)
  "currency": { "code": "EUR", "symbol": "€", "usd_rate": 0.86 },   // API prices are in USD
  "claude_plan": "max5",              // pro | max5 | max20 | team | enterprise | api  (top bar gauges)
  "clocks": [ { "label": "New York", "tz": "America/New_York" } ],  // extra clocks in Today (0-3)
  "panels": {                         // left/right column blocks; false = not rendered at all
    "today": true, "next_days": true, "inbox": false, "capture": true,
    "waiting": false, "skills": true, "routines": true
  },
  "today": {
    "widgets": ["clock", "clocks", "goal", "quarters"],   // order = display order
    "goal_label": "Next milestone"
  },
  "topbar": { "machine_health": true, "claude_usage": true, "search": true },
  "pages": [                          // centre tabs, in order. "brain" is always first.
    { "id": "brain" },
    { "id": "projects", "title": "Projects" },             // built-in: projects from areas + session journals
    { "id": "business", "title": "Business" },             // built-in: revenue (from a metrics routine) vs costs
    { "id": "content", "title": "Content", "kind": "custom", "icon": "video-camera" }  // custom page
  ],
  "areas": [                          // areas of the user's life/work (mirrors memory-map/areas)
    { "id": "work", "label": "Work", "color": "#3987e5", "journal": true, "logo": null }
  ],
  "brain": { "rings": ["skills", "memory", "routines", "apps"] },   // ring order from centre outwards
  "mail": {
    "enabled": false, "provider": "gmail",
    "watch": { "interval_min": 30, "day_start": 7, "day_end": 23 },
    "labels": [ { "name": "Work/Clients", "description": "client conversations" } ],
    "fallback_by_area": { "work": "Work/Clients" }
  },
  "off_limits": [],                   // absolute paths Claude must never read (search, chat, routines)
  "search_roots": ["~"],              // where the "/" palette searches
  "dashboard": { "port": 8765, "accent": "#ff7a2f", "tone": "inform" }  // tone: inform = never prioritise for the user
}
```

`routines/config.py` (shared helper) loads it with defaults so every script works even when a key is missing.

## Data contracts (what the dashboard reads)

All under `dashboard/data/` (written by routines/builders, read-only for the dashboard) or `state/`
(written by the dashboard server on user clicks only).

| File | Written by | Shape |
|---|---|---|
| `data/digest.json` | morning-digest routine | `{updated_at, summary, items[], waiting[], next_days[], overdue[], sources_ko[]}` |
| `data/inbox-live.json` | mail_watch.py | `{updated_at, checked_at, items[]}` |
| `data/routines.json` | run.py every tick | runner status, caps, last runs |
| `data/today.json` | build_today.py | `{week, gate, milestones[], window, projects[], os_cost_30d, quarters}` |
| `data/brain.json` | build_brain.py | `{nodes[{id,kind,label,area,layer,path,note,changed}], links[{s,t}]}` |
| `data/memory-map.json` | check.py (nightly) | `{ok, exit_code, lines[]}` |
| `data/metrics.json` | optional revenue routine | `{currency, mrr, products[], history[]}` |
| `data/page-<id>.json` | the routine that feeds custom page `<id>` | see below |

### Custom pages (`kind: "custom"`)

Any page the user needs (content calendar, clients, studies, training, investments…) is a JSON file
written by one of their routines and rendered by a generic renderer. No front-end code to write.

```jsonc
{
  "updated_at": "2026-10-07T07:30:00+02:00",
  "sections": [
    { "type": "kpis",  "title": "This week", "items": [ { "label": "Views", "value": "12.4k", "delta": "+8%", "hint": "vs last week" } ] },
    { "type": "list",  "title": "To publish", "items": [ { "title": "…", "detail": "…", "tag": "draft", "url": "https://…", "date": "2026-10-09" } ] },
    { "type": "chart", "title": "Followers", "unit": "", "series": [ { "name": "YouTube", "points": [["2026-10-01", 1200]] } ] },
    { "type": "table", "title": "Clients", "columns": ["Name", "Status", "Next step"], "rows": [["…", "…", "…"]] },
    { "type": "text",  "title": "Notes", "text": "Markdown-light text (**bold**, lists)" }
  ]
}
```

## Pulse (routines)

`routines/registry.json`: `caps`, `always_denied_tools` (every tool that sends, shares, deletes or
writes outside), `routines[]`. Paths in the registry are relative to `ROOT` (e.g.
`"prompts/morning-digest.md"`, `"command": ["python3", "{ROOT}/memory-map/check.py"]`).

Each routine: `name, label, schedule (5-field cron or null), catch_up_hours, machine, prompt_file |
command, model, effort, max_turns, timeout_seconds, allowed_tools[], output, deck (bool: show in the
skills deck), internal (bool: hidden, triggered by the dashboard), params {name: regex}`.

`run.py` runs every 5 minutes (launchd / systemd / cron). Rules: one run per schedule slot,
catch-up after sleep within `catch_up_hours`, daily and rolling-window caps, one TSV log line per
run (`routines/runs.log`), unused MCP servers denied per routine (`mcp_guard.py`) so a session never
loads hundreds of tools, `stdin=/dev/null`, env `AOS_JOURNAL=1` (prevents journal recursion).

## Screen (dashboard)

`python3 dashboard/server.py` → http://127.0.0.1:<port>. Loopback only, CSP, CSRF guard (Origin +
`X-Dashboard: 1`). It never writes to `dashboard/data/`; clicks write only to `state/` or enqueue a
routine request in `routines/queue/`. `/open` reveals files, never executes them.

## Security defaults (see SECURITY.md)

- Routines are read-only by default; outward actions (label/archive a mail) exist only behind a user click with validated parameters.
- Content from emails, web pages and files is data, never instructions.
- No secrets in journals, logs or the dashboard (`redact()`).
- `off_limits` paths are denied to search, chat and routines.
- Persistent changes (scheduler, hooks, git remote) are always confirmed by the user first.
