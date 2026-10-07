# Card 00 — Welcome and prerequisites

**Goal:** the user knows what is going to happen, the basics work, and `os.config.json` exists.

## Steps

1. **Language.** Answer in the language the user wrote in. Ask once: "Shall we do the whole setup in
   <language>?" Save it later as `language` (ISO code: en, fr, es, de…).
2. **Explain in 5 lines** what they will get: a map of their work so Claude finds anything in two
   steps; small automatic tasks (routines) that prepare things for them; a private dashboard on their
   computer; custom skills they can launch in one click. Setup takes 45 to 90 minutes, can be paused
   any time ("pause"), nothing is sent or deleted, and every permanent change is asked first.
3. **Check the basics** yourself (read-only commands), and explain any fix in plain words:
   - `python3 --version` → 3.10 or newer. If missing: macOS → "install the Command Line Tools:
     `xcode-select --install`" or python.org; Linux → their package manager.
   - `git --version` (optional but recommended, for backups).
   - `claude --version` → Claude Code works (it does, you are running in it).
   - Operating system: `uname -s` (Darwin = macOS, Linux). Windows: recommend WSL2 and say the
     scheduler step will be manual.
4. **Their Claude plan.** Ask: "Which Claude plan do you use: Pro, Max (5×), Max (20×), Team,
   Enterprise, or an API key?" → `claude_plan` = `pro | max5 | max20 | team | enterprise | api`. Explain
   that automatic tasks use the same quota as their chats, and that you will always show the cost.
5. **Timezone and currency.** Detect the timezone (`date +%Z`, `readlink /etc/localtime`) and confirm it
   (IANA name, e.g. `Europe/Paris`). Ask their currency (EUR, USD, GBP…) and set
   `currency = {code, symbol, usd_rate}` with a reasonable current rate (say it is approximate and editable).
6. **Name.** "What should your OS be called? (shown on the dashboard — e.g. 'Atlas', 'HQ', your initials)".
7. **Create** `os.config.json` from `os.config.example.json` with these answers, `setup_complete: false`,
   `machine` = short hostname (`hostname -s`). Create `setup/progress.json`.

## Done when
`os.config.json` exists with language, plan, timezone, currency, name; prerequisites are OK or the
user knows exactly what to install. Tell them: "Next: I will ask you about your work, one question at a time."
