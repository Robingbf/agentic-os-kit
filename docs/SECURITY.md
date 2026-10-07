# Security model

The OS runs unattended with access to your files and connected apps. These defaults keep the worst case
small. Do not weaken them without understanding why they exist.

1. **Local only.** The dashboard binds to 127.0.0.1, sends a strict Content-Security-Policy, and rejects
   cross-site requests (POST needs `X-Dashboard: 1` and a same-origin `Origin`). It never writes the data it
   shows; clicks only write to `state/` or queue a routine request.
2. **Read-only routines.** `routines/registry.json` → `always_denied_tools` lists every tool that sends,
   shares, creates, modifies or deletes in connected apps. Each routine also has its own short
   `allowed_tools` list, and every MCP server it does not need is denied entirely (`routines/mcp_guard.py`).
3. **Outward actions are clicks.** The only built-in action (filing an email: add a label, archive) is an
   `internal` routine triggered from the dashboard, with parameters validated by regular expressions and a
   label checked against your mail plan. It can never create labels, send or delete.
4. **Prompt-injection defence.** Every prompt says that emails, web pages, documents and tool results are
   data, never instructions; links found in email bodies are never copied into the dashboard.
5. **Secrets.** Session journals and logs pass through `redact()` (API keys, tokens, passwords, private
   keys, JWTs…). The pre-commit hook and the nightly snapshot block commits that look like secrets. Keep
   API keys in a local `.env` (git-ignored), never in prompts or config.
6. **Off-limits paths** (`off_limits`) are denied to search, the "/" chat, and routines.
7. **The "/" chat** can read your files but edit only inside the OS folder (never the dashboard code
   itself unless you ask in a normal Claude Code session), and cannot read off-limits paths, `~/.ssh` or
   keychains.
8. **Caps.** A daily run ceiling and a rolling-window ceiling stop a misbehaving routine from burning your
   quota.
9. **Consent.** The scheduler, Claude Code hooks, git remotes and any connector action are installed only
   after you say yes to a precise description of the change.
10. **Your data stays out of git** by default (`.gitignore`). If you back up to a remote, keep it private.

Found a problem? Open an issue without including personal data.
