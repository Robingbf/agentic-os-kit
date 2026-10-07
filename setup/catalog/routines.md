# Routines catalog

Each routine: when, what it reads (read-only tools), what it writes, model, rough cost. Costs are
estimates at API prices; on a Pro/Max plan they consume quota instead of money.

| Routine | When | Reads | Writes | Model | ≈ cost/run |
|---|---|---|---|---|---|
| Morning digest | daily 07:30 | mail, calendar, payments, map, goals | `data/digest.json` (summary, items, next days, waiting on you, overdue) | Sonnet | $0.10–0.40 |
| Mail watch | every 30 min, daytime | new mail threads (search only, then reads new ones) | `data/inbox-live.json` + desktop notification | Haiku + Sonnet if new | $0.01–0.05 per check |
| Weekly review | Fri 18:00 | session journals, runs log, goals | `state/outputs/weekly-<date>.md` | Sonnet | $0.10–0.30 |
| Stats refresh (custom page) | daily 06:00 | analytics / store / platform connector | `data/page-<id>.json` | Haiku or Sonnet | $0.02–0.15 |
| Revenue metrics | daily 06:00 | payments connector (read-only) | `data/metrics.json` | Sonnet | $0.05–0.20 |
| Deadline sweep | Mon 08:00 | mail + calendar + task tool | items into `data/digest.json` next days or a page | Haiku | $0.02–0.08 |
| Bills & renewals | 1st of month | mail (invoices, renewals) | `data/page-home.json` | Haiku | $0.02–0.08 |
| Memory map check | nightly 03:00 | the map | `data/memory-map.json` | none | free |
| Brain build | nightly 03:05 | map, registry, skills | `data/brain.json` | none | free |
| Git snapshot | nightly 03:10 | the OS folder | a commit (and push if a private remote exists) | none | free |
| Monthly OS review | 1st Sunday | runs log, costs, journals | `state/outputs/os-review-<date>.md` | Haiku | $0.02 |

Rules: read tools only; outward actions only behind a dashboard click with validated params; prefer
Haiku for collection, Sonnet for synthesis; set `catch_up_hours` so a routine missed during sleep still
runs on wake when it is still useful (digest: ~8 h; nightly jobs: ~20 h).
