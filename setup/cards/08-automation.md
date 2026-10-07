# Card 08 — Automation and backups (each step needs an explicit yes)

**Goal:** routines run on their own, sessions leave a journal, the OS is backed up.

## 1. Scheduler (routines every 5 minutes)
Explain: "a small system task checks every 5 minutes whether a routine is due; it uses no AI by itself."
Run `bash scheduler/install.sh` **only after their yes** (it prints what it installs and asks again).
macOS: a user LaunchAgent. Linux: a systemd user timer (or a cron line). Windows/WSL: show the manual
option from `scheduler/README.md`.
Tell them: when the computer sleeps (lid closed), routines pause and catch up on wake. For a morning
digest ready before they open the laptop: `sudo pmset repeat wakeorpoweron MTWRFSU 07:25:00` (macOS,
works reliably on power) — they run it themselves (it asks for their password).

## 2. Desktop app (recommended for everyone)
Explain: "your OS becomes a real app with its own icon: you open it like any app, it starts everything it
needs by itself, and the dashboard has ▶ start / ■ stop buttons in the top bar."
- macOS: `bash tools/desktop-app/build.sh` → `~/Applications/<OS name>.app` (needs the Command Line Tools:
  `xcode-select --install`). Open it, then right-click its Dock icon → Options → Keep in Dock. Optional: System
  Settings → General → Login Items → add it, so the OS opens at login.
- Linux: `bash tools/desktop-app/linux.sh` (asks before adding a menu entry).
- Anything else / no build: `bash tools/desktop-app/launch.sh` opens the dashboard in an app-style window.
Rebuild the macOS app whenever the OS name, accent colour or port changes.

## 3. Session journals (optional)
Explain: "when you finish a Claude Code session inside one of your projects, a short note of what was
done and where you stopped is saved for that area, and shown back next time you open it."
With their yes: back up `~/.claude/settings.json` (copy with a date suffix), then **add** (never replace)
hooks: `SessionStart` and `SessionEnd` → `python3 <ROOT>/hooks/session_journal.py`, and optionally
`statusLine` → `python3 <ROOT>/hooks/statusline.py` (shows the quota in the terminal and feeds the
dashboard gauge). Keep any existing hooks. Show the diff before saving.

## 4. Backups
The OS folder is a git repository. Offer: nightly snapshot (already in the registry: `git-snapshot`,
commits only if something changed, blocks commits that look like secrets). Personal files are
git-ignored by default — explain that this means **they are not backed up by git**; suggest their usual
backup (Time Machine, cloud folder) for `state/`, `interviews/`, `memory-map/areas/`, `os.config.json`,
or, with an explicit yes, removing those lines from `.gitignore` **if and only if** the remote is private.
Optional private remote: with their yes, `gh repo create <name> --private --source . --push` (needs the
GitHub CLI and login) — never public.

## Done when
Scheduler installed (or consciously skipped), desktop app built and opened once, hooks decided, backup plan clear. Next: card 09.
