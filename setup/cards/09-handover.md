# Card 09 — Handover

**Goal:** everything works, the user knows how to live with it and change it.

## Steps

1. **Final checks:** `python3 memory-map/check.py` (exit 0), `python3 routines/run.py` (one tick, no
   error in `routines/runs.log`), dashboard loads without console errors, every enabled routine has run
   once, `git status` shows no personal file staged.
2. **Cost summary:** open ⚙ Settings in the dashboard together; read the estimated monthly cost of all
   automatic activity and compare with their plan. Adjust (less frequent, cheaper model) if they want.
3. **How to use it, in 5 lines** (write it to `interviews/how-to.md` too): open the dashboard; press
   "/" to search or ask; ▶ in the skills deck; capture an idea in Capture; ask Claude "add a page / a
   routine / a skill for …" in this folder.
4. **How to change it:** `docs/CUSTOMISING.md`; re-run any card ("redo card 04").
5. Set `"setup_complete": true` in `os.config.json`, mark card 09 done in `setup/progress.json`.
6. Offer one optional extra: a **monthly OS review** routine (first Sunday of the month, Haiku, reads
   `routines/runs.log`, the costs and the journals, and writes 3 suggestions to improve or simplify the OS
   in `state/outputs/os-review-<date>.md`). Only with a yes.

## Done when
`setup_complete` is true and they know the 5 lines by heart. Congratulate them briefly.
