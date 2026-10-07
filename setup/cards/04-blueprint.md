# Card 04 — Blueprint: design their OS

**Goal:** a short, validated design of *their* OS. This is the most important card: everything after it
just builds what is decided here.

## Inputs
`interviews/*` (cards 01–02), the memory map (card 03), and the catalog (`setup/catalog/`) for ideas.

## Steps

1. **List their needs** in one table, from the interviews: need → today's pain → how often. Keep only
   needs that pass the value test (saves weekly time / prevents a miss / gathers scattered info / shows
   something invisible today).
2. **Match each need to a building block**, smallest first:

   | Block | Use it when |
   |---|---|
   | Left/right **panel** (Today, Next days, Inbox, Capture, Waiting on you, Skills deck, Routines) | they want to *see* it at a glance all day |
   | **Today widgets** (clock, extra clocks, next milestone, 13-week quarter grid) | time zones, deadlines, a countdown matter |
   | Built-in **pages**: Brain (always), Projects, Business | Projects: they run several projects with tasks; Business: they have revenue + costs to compare |
   | **Custom page** (`kind: custom`, fed by a routine writing `dashboard/data/page-<id>.json`) | a domain view the built-ins do not cover: Content, Clients, Studies, Training, Job applications, Investments, Properties… |
   | **Routine** (scheduled) | something should be prepared *before* they look: digest, weekly report, stats refresh, reminders |
   | **Skill** (on demand, in the deck) | a repeated task they trigger themselves: draft a reply, prepare a client brief, turn notes into a post… |
   | **Mail plan** (labels + "File" button) | only if email is central and they want help filing |

   Panels **off** by default unless needed: Inbox (needs a mail connector), Waiting on you (needs mail
   or messages), Next days (needs a calendar or dated tasks).
3. **Draft the blueprint** in `interviews/blueprint.md`:
   - panels on/off and Today widgets (+ clocks, goal label);
   - pages in order (built-ins kept, custom pages with id, title, Phosphor icon name, which routine feeds
     them and what sections they show);
   - routines: name, when (plain words + cron), what it reads, what it writes, tools (read-only),
     model, estimated cost per run and per month;
   - skills: name, what it does, inputs, output, where it saves things;
   - milestones for `goals.json` (date, label, area, whether it is a "gate" — a key date shown in Today);
   - mail plan (labels with one-line descriptions), only if relevant.
   Keep it small: typically 2–4 routines and 2–5 skills to start. More can come later.
4. **Present it** in plain language (no JSON): "Here is what your dashboard will show, here is what will
   run automatically and what it costs, here are the buttons you will have." Ask what to remove, add,
   rename. Iterate until they say it is right.
5. **Write the decisions:** update `os.config.json` (`panels`, `today`, `clocks`, `pages`, `topbar`,
   `mail`, `brain.rings` if they want another ring order, `dashboard.accent` if they chose a colour),
   and `goals.json`:
   ```json
   { "window_start": "YYYY-MM-DD", "window_days": 90,
     "milestones": [ { "date": "YYYY-MM-DD", "label": "…", "area": "<area id>", "gate": true } ] }
   ```

## Done when
`interviews/blueprint.md` is validated and the config reflects it. Next: card 05 (build the routines).
