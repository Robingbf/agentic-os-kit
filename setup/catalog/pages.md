# Pages catalog

## Built-in
- **Brain** (always): the memory map as a living graph — areas in the centre, then rings of skills,
  memory, routines and apps. Six views (rings, circle, areas, links, timeline, 3D orbit).
- **Projects** (optional base, adapted by the setup): a board of projects by status (Ideas → In development →
  Launch → Live → Paused by default) and, per project, an overview (progress, next milestone, "Next time", last
  session, links), a task kanban (To triage / To do / In progress / Blocked / Done, with importance, due dates, tags,
  notes), a timeline (tasks + milestones from `goals.json`) and an Ideas tab. Data: `projects/<id>.json`. It syncs by
  itself with session journals (open tasks, done tasks, "Next time") and captured ideas. Statuses, columns and
  importance levels are renamed in `os.config.json` → `projects`, so it fits other kinds of work: a creator might use
  columns Script / Shoot / Edit / Publish, a freelancer Lead / Quote / In progress / Invoiced / Paid, a student
  To read / Writing / Submitted. Removed entirely when the user does not manage projects with tasks.
- **Business**: revenue (from a routine writing `dashboard/data/metrics.json`, e.g. from Stripe) vs costs
  (editable table, stored in `state/costs.json`), one gains-vs-costs chart, monthly total.
- **Settings** (⚙ button): every automatic activity, its frequency and measured cost, the plan value.

## Custom pages (`kind: "custom"`) — written by a routine as `dashboard/data/page-<id>.json`
Sections: `kpis`, `list`, `chart`, `table`, `text` (format in `docs/ARCHITECTURE.md`). Ideas:

| Page | Sections | Fed by |
|---|---|---|
| Content | kpis (views, subs, watch time), list (pipeline by stage), chart (followers) | stats connector or exported CSV + a notes file |
| Clients | table (client, status, next step, last contact, unpaid), list (this week's deliveries) | mail + calendar + a clients folder |
| Studies | list (deadlines this week), table (courses, next exam, grade), text (reading list) | school portal emails, calendar, notes |
| Applications | table (company, role, stage, next action, date), kpis (sent, interviews, offers) | a tracking file + job alert emails |
| Sales | kpis (pipeline value, won this month), table (deals by stage) | CRM connector or a spreadsheet export |
| Home | list (bills due, renewals, appointments), table (subscriptions and prices) | mail + calendar + a bills folder |
| Training / health | chart (weekly volume), kpis (streak), list (next sessions) | an app export or a notes file |
| Investments / money | kpis (net worth, monthly savings), chart (balance), table (holdings) | exported statements in a folder (never trade or move money) |

Icons: any Phosphor icon name (https://phosphoricons.com), e.g. `video-camera`, `users`, `graduation-cap`,
`briefcase`, `house`, `chart-line`, `barbell`, `wallet`.
