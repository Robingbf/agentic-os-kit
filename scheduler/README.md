# Scheduler

The routine runner (`routines/run.py`) has to run **every 5 minutes**. Each run (a "tick") does whatever is due:
scheduled routines (including catch-up after sleep), dashboard requests from `routines/queue/`, the status file
`dashboard/data/routines.json`, and the light background jobs (mail watch, Claude quota, builders).

## Install (recommended)

```bash
bash scheduler/install.sh            # prints what it will do, then asks y/N
bash scheduler/install.sh --dry-run  # print only
bash scheduler/uninstall.sh          # undo (also asks first)
```

| System | What `install.sh` sets up |
|---|---|
| macOS | launchd user agent `~/Library/LaunchAgents/com.agentic-os.routines.plist` (`StartInterval` 300 s, `RunAtLoad`) |
| Linux with systemd | user units `~/.config/systemd/user/agentic-os-routines.{service,timer}` (every 5 min, `Persistent=true`) |
| Linux without systemd --user | one crontab line tagged `# agentic-os-routines` (or force it with `--cron`) |

The files are generated from the templates in this folder with your real OS folder, your `python3` and a `PATH`
that includes `~/.local/bin` and `/opt/homebrew/bin` (where the `claude` CLI usually lives). Output goes to
`routines/scheduler.log` (git-ignored).

## Manual alternatives

Render a template yourself (the placeholders are `__ROOT__`, `__PYTHON__`, `__PATH__`):

```bash
python3 scheduler/render.py scheduler/com.agentic-os.routines.plist.template "$PWD" "$(command -v python3)" "$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin" --xml
```

- **macOS**: save the output to `~/Library/LaunchAgents/com.agentic-os.routines.plist`, then
  `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.agentic-os.routines.plist`.
  Remove with `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.agentic-os.routines.plist`.
- **systemd**: render both `agentic-os-routines.*.template` files into `~/.config/systemd/user/`, then
  `systemctl --user daemon-reload && systemctl --user enable --now agentic-os-routines.timer`.
  To keep it running while logged out: `loginctl enable-linger $USER`.
- **cron**: `crontab -e` and paste the rendered `cron.line.template`.
- **Anything else** (Windows Task Scheduler, a tmux loop…): run `python3 routines/run.py` from the OS folder every
  5 minutes. A tick that overlaps a running one exits immediately (lock file), so a short interval is safe.

Test a single tick by hand: `python3 routines/run.py`. Force one routine: `python3 routines/run.py --now <name>`.

## Waking a Mac for the morning digest

Routines only run while the computer is awake; a missed slot is caught up within the routine's `catch_up_hours`
when it wakes. To have the digest ready when you sit down, you can schedule a wake a few minutes before it
(not done by the installer):

```bash
sudo pmset repeat wakeorpoweron MTWRFSU 07:25:00   # undo: sudo pmset repeat cancel
```
