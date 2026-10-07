# Install guide — step by step, no experience needed

Follow the steps in order. Each step says **what to do** and **how to know it worked**. Total: about 15
minutes, then the guided setup with Claude (45–90 minutes, can be paused).

> Words you will meet: the **Terminal** is an app where you type commands. A **command** is a line
> you copy, paste, then press **Enter**. If a command shows an error, copy the error and paste it to
> Claude (step 6) — it will help you.

---

## Step 1 — A Claude plan

You need a Claude subscription (**Pro**, **Max**, **Team** or **Enterprise**) at
[claude.ai](https://claude.ai), or an Anthropic API key. Pro is enough to start; Max gives much more room
for automatic routines.

✅ You can log in at claude.ai.

## Step 2 — Open the Terminal

- **Mac:** press `⌘ Command` + `Space`, type `Terminal`, press Enter.
- **Linux:** open your Terminal app (often `Ctrl` + `Alt` + `T`).
- **Windows:** install WSL2 (search "Install WSL" on learn.microsoft.com), open "Ubuntu", and follow the
  Linux instructions everywhere below.

✅ A window with a blinking cursor is open.

## Step 3 — Install Claude Code

Follow the official instructions: **https://docs.claude.com/en/docs/claude-code/setup** (one command to
copy). Then check:

```bash
claude --version
```

✅ It prints a version number. (If it says "command not found", close the Terminal, open it again, and
retry. Still failing? Re-read the official page — it explains PATH issues.)

## Step 4 — Check Python and Git

```bash
python3 --version
git --version
```

✅ Python shows **3.10 or higher** and Git shows a version.
- Mac, if either is missing: run `xcode-select --install` and click *Install*, then retry.
- Linux: `sudo apt install python3 git` (Ubuntu/Debian) or your distribution's equivalent.

## Step 5 — Download the kit

```bash
git clone https://github.com/Robingbf/agentic-os-kit.git ~/agentic-os
cd ~/agentic-os
bash setup.sh
```

No Git? Click **Code → Download ZIP** on GitHub, unzip it, rename the folder
`agentic-os`, move it to your home folder, then in the Terminal: `cd ~/agentic-os && bash setup.sh`.

✅ `setup.sh` ends with "Ready. Now run: claude".

## Step 6 — Start Claude in the kit folder

```bash
claude
```

The first time, Claude Code asks you to log in: choose your Claude account, a browser page opens,
approve, come back. Then simply type:

> **hi, let's set up my OS**

✅ Claude greets you and starts **Card 00**. From now on, just answer its questions. It will:
interview you about your work, look at your tools, map your folders (only the ones you allow), design
your OS with you, build and test it, then show you your dashboard.

## Step 7 — (Recommended) Connect your apps

Routines are far more useful when Claude can read your mail, calendar or documents. On
[claude.ai](https://claude.ai) → **Settings → Connectors**, connect the services you use (Gmail, Google
Calendar, Google Drive, Notion, Slack…). They become available in Claude Code with the same account.
Card 02 tells you which ones are worth it for you. Connectors are only ever used **read-only** by the OS,
unless you explicitly ask for an action.

---

## Option B — No terminal: the Claude desktop app (Code tab)

If you use Claude Code inside the **Claude desktop app** (or the VS Code / JetBrains extension), you can
skip steps 2 to 6: Claude does the technical part for you.

1. Install the [Claude desktop app](https://claude.ai/download), log in, open the **Code** tab.
2. Start a session in your **home folder** (choose it as the working folder when you open the session).
3. Paste this message:
   > Clone https://github.com/Robingbf/agentic-os-kit into ~/agentic-os, run `bash setup.sh` inside it,
   > and tell me if anything is missing on my computer.
   Claude asks your permission before running each command: read it, then accept.
4. Open a **new session** whose working folder is `~/agentic-os` (this matters: the kit's `CLAUDE.md`
   only loads when the session runs in that folder).
5. Say: **hi, let's set up my OS**. The guided setup starts (Card 00).

For the dashboard, ask Claude: "start my dashboard". Depending on your app, it opens in a preview pane
or gives you the address http://127.0.0.1:8765 to open in your browser.

---

## Every day after setup

Open your OS **app** (created at the end of the setup — macOS: `bash tools/desktop-app/build.sh`, Linux:
`bash tools/desktop-app/linux.sh`). It starts everything by itself; ▶ start / ■ stop are in the top bar.
Without the app: `cd ~/agentic-os && python3 dashboard/server.py`, then open http://127.0.0.1:8765.

## Troubleshooting

| Problem | Fix |
|---|---|
| `claude: command not found` | close and reopen the Terminal; re-run the official installer |
| `python3: command not found` | Mac: `xcode-select --install`; Linux: install `python3` |
| The dashboard page does not open | is `python3 dashboard/server.py` still running in a Terminal tab? |
| "Address already in use" | the dashboard is already running: just open the address |
| Routines did not run overnight | the computer was asleep; they catch up when it wakes (card 08 explains how to wake it early) |
| Something looks wrong | open `claude` in the folder and describe it; Claude knows this kit (CLAUDE.md) |

## Uninstall

`bash scheduler/uninstall.sh` (if you installed the scheduler), remove the hooks Claude added to
`~/.claude/settings.json` (a dated backup was made), then delete the `~/agentic-os` folder.
