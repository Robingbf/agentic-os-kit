#!/usr/bin/env python3
"""Watch for new mail during the day and analyse it -> dashboard/data/inbox-live.json.

No-op unless os.config.json has mail.enabled = true (provider "gmail" only for now, through the Gmail connector).
Step 1 (every mail.watch.interval_min minutes, from day_start to day_end): Haiku lists recent threads with the
Gmail search tool only (about $0.03). Step 2, only when there are threads never seen before: Sonnet analyses
them (same item format as the digest: area, links, suggestions, actions). A desktop notification is shown
for the ones that need an action (osascript on macOS, notify-send on Linux when available).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import config  # noqa: E402
import mcp_guard  # noqa: E402
import usage_probe  # noqa: E402

OUT = config.path("dashboard", "data", "inbox-live.json")
DIGEST = config.path("dashboard", "data", "digest.json")
SEEN = config.path("state", "mail-seen.json")
DONE = config.path("state", "done.json")
LOG = config.path("state", "mail-watch.log")
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
KEEP_HOURS = 48          # how long new mail stays on screen
LIST_MODEL, ANALYSE_MODEL = "haiku", "sonnet"
G = "mcp__claude_ai_Gmail__"
GMAIL_ALL = ["apply_sensitive_message_label", "apply_sensitive_thread_label", "create_draft", "create_label", "delete_draft",
             "delete_label", "forward", "get_draft", "get_message", "get_thread", "label_message", "label_thread", "list_drafts",
             "list_labels", "mark_message_spam", "mark_thread_spam", "reply", "search_threads", "send_message", "trash_message",
             "trash_thread", "unlabel_message", "unlabel_thread", "unmark_message_spam", "unmark_thread_spam", "untrash_message",
             "untrash_thread", "update_draft", "update_label", "update_message_labels"]


def read(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(path + ".tmp", path)


def claude(prompt, model, keep, max_turns, timeout):
    """Minimal session: only the Gmail tools in `keep`, no other connector. Returns (json, cost)."""
    allowed = [G + t for t in keep]
    denied = [G + t for t in GMAIL_ALL if t not in keep] + mcp_guard.deny_for(allowed)
    cmd = [CLAUDE, "-p", prompt, "--model", model, "--max-turns", str(max_turns), "--output-format", "stream-json", "--verbose",
           "--disable-slash-commands", "--tools", "", "--allowedTools", *allowed, "--disallowedTools", *denied]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=tempfile.gettempdir(),
                           stdin=subprocess.DEVNULL, env={**os.environ, "AOS_JOURNAL": "1"})
    except (subprocess.TimeoutExpired, OSError):
        return None, 0
    lines = p.stdout.splitlines()
    cost = usage_probe.record(lines, "mail-watch")
    result = {}
    for line in reversed(lines):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "result":
            result = d
            break
    text = result.get("result") or ""
    text = text[text.find("{"): text.rfind("}") + 1]  # the JSON, even when wrapped in text or a code block
    try:
        return json.loads(text), cost
    except ValueError:
        return None, cost


def notify(items, os_name):
    todo = [i for i in items if i.get("action")]
    if not todo:
        return
    title = f"{len(todo)} new email(s) to handle"
    body = " · ".join(str(i.get("title", ""))[:60] for i in todo[:3])
    try:
        if sys.platform == "darwin":
            script = f"display notification {json.dumps(body)} with title {json.dumps(os_name)} subtitle {json.dumps(title)}"
            subprocess.run(["osascript", "-e", script], capture_output=True, timeout=10)
        elif shutil.which("notify-send"):
            subprocess.run(["notify-send", f"{os_name}: {title}", body], capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        pass


def main(force=False):
    cfg = config.load()
    mail = cfg.get("mail", {})
    if not mail.get("enabled") or mail.get("provider", "gmail") != "gmail" or not os.path.exists(CLAUDE):
        return
    watch = mail.get("watch", {})
    interval, day_start, day_end = int(watch.get("interval_min", 30)), int(watch.get("day_start", 7)), int(watch.get("day_end", 23))
    now = datetime.now()
    live = read(OUT, {"items": []})
    checked = live.get("checked_at")
    try:
        fresh = bool(checked) and (now - datetime.fromisoformat(checked).replace(tzinfo=None)) < timedelta(minutes=interval - 1)
    except ValueError:
        fresh = False
    if not force and (fresh or not day_start <= now.hour < day_end):
        return
    # 1. recent threads (no promotions, no social notifications) + threads the user replied to
    found, cost1 = claude('Make exactly two search_threads calls: (1) query "in:inbox newer_than:1d -category:promotions -category:social", '
                          '(2) query "in:sent newer_than:1d". Answer only with JSON: '
                          '{"threads": [{"id": "<threadId>", "from": "...", "subject": "..."} for query 1], "replied": ["<threadId>" for query 2]}',
                          LIST_MODEL, ["search_threads"], 4, 90)
    seen = set(read(SEEN, []))
    digest = read(DIGEST, {})
    in_digest = {x.get("id") for k in ("overnight", "waiting", "overdue") for x in digest.get(k, []) if isinstance(x, dict)}
    threads = [t for t in (found or {}).get("threads") or [] if isinstance(t, dict)]
    first_run = not seen
    new = [t for t in threads if t.get("id") and t["id"] not in seen and f"gmail:{t['id']}" not in in_digest]
    seen |= {t["id"] for t in threads if t.get("id")}
    # the user replied to a thread that was waiting on them: it leaves "Waiting on you" (ticked automatically)
    replied = {str(r) for r in (found or {}).get("replied") or []}
    waiting_ids = {x.get("id") for x in digest.get("waiting", []) if isinstance(x, dict)} | \
                  {i.get("id") for i in live.get("items", []) if i.get("waiting")}
    auto = [f"gmail:{r}" for r in replied if f"gmail:{r}" in waiting_ids]
    if auto:
        done = read(DONE, {})
        for i in auto:
            done.setdefault(i, {"done_at": now.astimezone().isoformat(timespec="seconds"), "auto": "reply sent"})
        write(DONE, done)
    cost2, items = 0, []
    if new and not first_run:  # on the very first check, remember everything without analysing it (the digest covers it)
        import run  # placeholders shared with the routines ({{language}}, {{areas}}, {{mail_plan}}…)
        with open(os.path.join(HERE, "prompts", "mail-triage.md"), encoding="utf-8") as f:
            prompt = run.fill(f.read(), run.placeholders(cfg))
        prompt = prompt.replace("{{threads}}", "\n".join(f"- {t['id']} · {t.get('from', '')} · {t.get('subject', '')}" for t in new[:10]))
        res, cost2 = claude(prompt, ANALYSE_MODEL, ["get_thread", "list_labels"], 15, 300)
        items = [{**i, "received_at": now.isoformat(timespec="seconds")} for i in (res or {}).get("items", []) if isinstance(i, dict)]
        notify(items, cfg.get("name") or "Agentic OS")
    keep_after = (now - timedelta(hours=KEEP_HOURS)).isoformat()
    old = [i for i in live.get("items", []) if i.get("received_at", "") >= keep_after and i.get("id") not in {x.get("id") for x in items}]
    write(OUT, {"updated_at": now.astimezone().isoformat(timespec="seconds"), "checked_at": now.isoformat(timespec="seconds"),
                "items": items + old, "last_new": len(new)})
    write(SEEN, sorted(seen)[-2000:])
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{now.isoformat(timespec='seconds')}\tmail-watch\t{round(cost1 + cost2, 4)}\t{len(threads)} threads · {len(new)} new · "
                f"{len(items)} analysed · {len(auto)} replied\t{round(cost1, 4)}\t{round(cost2, 4)}\n")


if __name__ == "__main__":
    main(force="--force" in sys.argv)
