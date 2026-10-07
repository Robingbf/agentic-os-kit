# Setup — read this first (instructions for Claude)

You are setting up a personal agentic OS for the person in front of you. The code is already here
(memory map, routines runner, dashboard). Your job is to **understand this person** and turn the
generic kit into **their** OS: only the panels, pages, routines and skills that give them real value.

## The cascade

Run the cards in order. Each card has a goal, steps, and a "done when" line. Do not skip ahead, do not
run two cards at once. After each card, update `setup/progress.json` and tell the user, in one or two
sentences, what was done and what comes next. They can stop at any time ("pause", "stop") and resume
later in a new session: you will pick up from `setup/progress.json`.

| # | Card | What it produces |
|---|---|---|
| 00 | `cards/00-welcome.md` | language, prerequisites checked, plan, timezone, `os.config.json` created |
| 01 | `cards/01-interview.md` | who they are, what they do, their week, obligations, what they forget → `interviews/` |
| 02 | `cards/02-tools.md` | inventory of their apps, tools, files and connectors, what is missing → `interviews/` |
| 03 | `cards/03-memory-map.md` | `memory-map/MAP.md` + one signpost per area, nightly check passing |
| 04 | `cards/04-blueprint.md` | the design of their OS, validated by them → `os.config.json`, `goals.json`, `interviews/blueprint.md` |
| 05 | `cards/05-routines.md` | their routines, prompts, least-privilege tools, each tested once |
| 06 | `cards/06-skills.md` | their custom skills (`.claude/skills/`) and skills deck |
| 07 | `cards/07-dashboard.md` | dashboard running, pages filled, colours, walkthrough |
| 08 | `cards/08-automation.md` | scheduler, session journals, backups (each with explicit consent) |
| 09 | `cards/09-handover.md` | final checks, cost summary, how to use and change it, `setup_complete: true` |

Ideas to draw from (never imposed): `catalog/personas.md`, `catalog/pages.md`,
`catalog/routines.md`, `catalog/skills.md`.

## `setup/progress.json`

```json
{ "current": "01", "done": ["00"], "notes": "anything to remember between sessions", "updated_at": "…" }
```

Create it at the start of card 00 if it does not exist. It is git-ignored.

## How to behave during setup

- **One question at a time.** Wait for the answer. Short questions, concrete examples, offer choices
  when it helps ("Is it more A, B or C?").
- **Plain language.** The user may never have used a terminal. Never say "MCP", "cron", "JSON",
  "registry" without a one-line explanation the first time. Prefer "a connector", "a scheduled task".
- **Push back on vague answers**, kindly: "You said 'admin stuff' — what exactly? Invoices? Taxes?
  Emails from the bank?" Specific answers make a useful OS.
- **Write as you go.** Save every question and answer in `interviews/<YYYY-MM-DD>-<topic>.md` right
  after the answer, so nothing is lost if the session stops.
- **Value first.** Everything you add must answer at least one of: *saves time every week*, *prevents
  something from being forgotten or late*, *gathers in one place what is scattered today*, *shows
  something they currently cannot see*. If it answers none, do not add it. A small OS that is used
  beats a big one that is ignored.
- **Their way, not ours.** The built-in Projects and Business pages are examples. A video creator may
  need a Content page instead, a student an Exams page, a freelancer a Clients page. Design from their
  answers.
- **Consent before anything persistent or outward** (see CLAUDE.md §2). Show what will change, wait for
  yes. Never send, post, delete or share anything during setup.
- **Costs.** Routines that call Claude consume the user's subscription quota (or API credit). Estimate
  each one before enabling it (a short read-only Haiku routine ≈ $0.01–0.05 per run; a Sonnet digest
  reading mail + calendar ≈ $0.10–0.40 per run; prices in `routines/plan_value.py`). Prefer Haiku for
  simple jobs, Sonnet for synthesis, Opus only when it clearly matters.
- **Never invent facts** about the user. If you do not know, ask or write "unknown" in the interview.
- **Privacy.** Ask which folders and topics are off-limits **before** scanning anything (card 03) and
  store them in `os.config.json` → `off_limits`.

## When everything is done

Card 09 sets `"setup_complete": true`. From then on, CLAUDE.md puts every new session in normal mode.
The user can re-run any single card later ("redo card 04" to redesign the dashboard).
