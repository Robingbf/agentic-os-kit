#!/usr/bin/env python3
"""Routine runner. Started every 5 minutes by the scheduler (launchd / systemd / cron); runs whatever is due.

It also processes the manual requests the dashboard drops in routines/queue/.

Usage:
  python3 routines/run.py              # normal tick
  python3 routines/run.py --now NAME   # force one routine (caps still apply)
"""
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import config  # noqa: E402

ROOT = config.ROOT
REGISTRY = os.path.join(HERE, "registry.json")
LOG = os.path.join(HERE, "runs.log")
STATUS = config.path("dashboard", "data", "routines.json")
QUEUE = os.path.join(HERE, "queue")
INBOX = config.path("state", "inbox")
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")
GUARD_ENV = {"AOS_JOURNAL": "1"}   # sessions started by the OS are never summarised into the journals

LANGUAGES = {"en": "English", "fr": "French", "es": "Spanish", "de": "German", "it": "Italian", "pt": "Portuguese",
             "nl": "Dutch", "pl": "Polish", "sv": "Swedish", "da": "Danish", "no": "Norwegian", "fi": "Finnish",
             "ja": "Japanese", "zh": "Chinese", "ko": "Korean", "ru": "Russian", "uk": "Ukrainian", "tr": "Turkish",
             "ar": "Arabic", "hi": "Hindi"}


# --- minimal cron: *, */n, a-b, a-b/n, lists ---
def field(spec, lo, hi):
    out = set()
    for part in spec.split(","):
        rng, _, step = part.partition("/")
        step = int(step or 1)
        if rng == "*":
            a, b = lo, hi
        elif "-" in rng:
            a, b = map(int, rng.split("-"))
        else:
            a = b = int(rng)
        out.update(range(a, b + 1, step))
    return out


def matches(schedule, t):
    mi, h, dom, mon, dow = schedule.split()
    days = field(dow, 0, 7)
    if 7 in days:
        days.add(0)
    dom_ok = t.day in field(dom, 1, 31)
    dow_ok = (t.weekday() + 1) % 7 in days
    day_ok = (dom_ok or dow_ok) if (dom != "*" and dow != "*") else (dom_ok and dow_ok)
    return t.minute in field(mi, 0, 59) and t.hour in field(h, 0, 23) and t.month in field(mon, 1, 12) and day_ok


def last_slot(schedule, now, hours):
    """Latest scheduled slot within the last `hours` hours, or None."""
    t = now.replace(second=0, microsecond=0)
    for _ in range(int(hours * 60) + 1):
        if matches(schedule, t):
            return t
        t -= timedelta(minutes=1)
    return None


def next_slot(schedule, now, days=8):
    """Next scheduled slot within `days` days, or None."""
    t = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(days * 1440):
        if matches(schedule, t):
            return t
        t += timedelta(minutes=1)
    return None


# --- log: one TSV line per run: time, name, model, turns, cost (USD), duration (s), status ---
def read_log():
    rows = []
    if os.path.exists(LOG):
        with open(LOG, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) == 7:
                    rows.append({"time": p[0], "name": p[1], "model": p[2], "turns": p[3], "cost": p[4], "duration": p[5], "status": p[6]})
    return rows


def append_log(name, model, turns, cost, status, duration=0):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')}\t{name}\t{model}\t{turns}\t{cost}\t{duration}\t{status}\n")


def counted(rows):
    """Real runs (refusals: caps, invalid or disabled requests, do not count)."""
    return [r for r in rows if r["status"] not in ("capped", "bad-params", "disabled", "unknown-routine")]


def cap_usage(rows, caps, now):
    real = counted(rows)
    today = now.date().isoformat()
    since = now - timedelta(minutes=caps["window_minutes"])
    return {
        **caps,
        "runs_today": sum(r["time"].startswith(today) for r in real),
        "runs_in_window": sum(datetime.fromisoformat(r["time"]) >= since for r in real),
    }


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def stamp():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def resolve(p, base=ROOT):
    """Registry path: "{ROOT}/x", absolute, or relative to `base` (ROOT by default)."""
    p = os.path.expanduser(config.expand(p))
    return p if os.path.isabs(p) else os.path.join(base, p)


def for_this_machine(r, cfg):
    m = r.get("machine", "*")
    return m in ("*", "", None) or m == cfg["machine"]


def requirement_met(r, cfg):
    """Optional "requires": "mail" -> the routine only exists when mail is enabled in os.config.json."""
    need = r.get("requires")
    return not need or (need == "mail" and bool(cfg.get("mail", {}).get("enabled")))


# --- prompt placeholders: {{language}}, {{os_name}}, {{areas}}, {{mail_plan}}, {{timezone}}, ... ---
def placeholders(cfg):
    lang = cfg.get("language") or "en"
    areas = "\n".join(f"- {a['id']}: {a.get('label', a['id'])}" for a in cfg.get("areas", [])) or "- general: General (no areas defined yet)"
    try:
        import mail_plan
        plan = mail_plan.plan_text(cfg)
    except Exception:
        plan = ""
    return {
        "language": LANGUAGES.get(lang.split("-")[0].lower(), lang),
        "language_code": lang,
        "os_name": cfg.get("name") or "Agentic OS",
        "areas": areas,
        "area_ids": "|".join(a["id"] for a in cfg.get("areas", [])) or "general",
        "mail_plan": plan or "(no mail filing plan configured)",
        "timezone": cfg.get("timezone") or "UTC",
        "root": ROOT,
        "today": datetime.now().date().isoformat(),
    }


def fill(text, values):
    for k, v in values.items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


# --- execution ---
def run_command(r, params=None):
    cmd = [sys.executable if c == "python3" else config.expand(c) for c in r["command"]]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=r.get("timeout_seconds", 120), cwd=ROOT,
                           stdin=subprocess.DEVNULL, env={**os.environ, **GUARD_ENV, "AOS_PARAMS": json.dumps(params or {})})
    except subprocess.TimeoutExpired:
        return 0, 0, "timeout"
    except OSError:
        return 0, 0, "not-found"
    if r.get("capture_stdout") and r.get("output"):  # otherwise the script writes its own output
        lines = (p.stdout + p.stderr).strip().splitlines()
        write_json(resolve(r["output"]), {"updated_at": stamp(), "ok": p.returncode == 0, "exit_code": p.returncode, "lines": lines})
    return 0, 0, "ok" if p.returncode == 0 else f"exit-{p.returncode}"


def inbox_notes(status="new"):
    out = []
    if os.path.isdir(INBOX):
        for fn in sorted(os.listdir(INBOX)):
            if fn.endswith(".json"):
                try:
                    with open(os.path.join(INBOX, fn), encoding="utf-8") as f:
                        n = json.load(f)
                except (OSError, ValueError):
                    continue
                if n.get("status") == status:
                    out.append(n)
    return out


def parse_json_result(text):
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    for candidate in (text, text[text.find("{"): text.rfind("}") + 1]):
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except ValueError:
            pass
    return None


def run_claude(r, reg, cfg, params=None):
    if not os.path.exists(CLAUDE):
        return 0, 0, "no-claude-cli"
    with open(resolve(r["prompt_file"], HERE), encoding="utf-8") as f:   # "prompts/x.md" is relative to routines/
        prompt = fill(f.read(), placeholders(cfg))
    prompt = fill(prompt, params or {})  # values already validated against the registry patterns
    if r.get("inject") == "inbox":
        notes = inbox_notes()
        if not notes:
            return 0, 0, "ok"  # nothing to triage
        prompt += "\n\n<notes>\n" + json.dumps([{"id": n["id"], "text": n["text"], "created_at": n["created_at"]} for n in notes],
                                               ensure_ascii=False, indent=1) + "\n</notes>"
    allowed = r.get("allowed_tools", [])
    import mcp_guard
    # a routine may lift a ban only by listing the exact tool in its own allowed_tools
    denied = [t for t in reg.get("always_denied_tools", []) if t not in allowed]
    denied += [t for t in mcp_guard.denied_by_pattern(reg.get("always_denied_patterns", []), allowed) if t not in denied]
    denied += mcp_guard.deny_for(allowed)  # otherwise hundreds of unused MCP tools load: context overflow, wasted cost
    cmd = [CLAUDE, "-p", prompt, "--model", r.get("model", "sonnet"), "--max-turns", str(r.get("max_turns", 20)),
           "--output-format", "stream-json", "--verbose"]
    if r.get("effort"):
        cmd += ["--effort", r["effort"]]
    if allowed:
        cmd += ["--allowedTools", *allowed]
    if denied:
        cmd += ["--disallowedTools", *denied]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=r.get("timeout_seconds", 600), cwd=ROOT,
                           env={**os.environ, **GUARD_ENV}, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return 0, 0, "timeout"
    lines = p.stdout.splitlines()
    out = None
    for line in lines:  # stream-json: keep the final "result" message
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "result":
            out = d
    try:  # subscription quota (rate_limit_event) and the MCP servers listed in the init event
        import usage_probe
        usage_probe.record(lines, r["name"])
        mcp_guard.learn(lines)
    except Exception:
        pass
    if out is None:
        return 0, 0, f"crash-{p.returncode}"
    turns, cost = out.get("num_turns", 0), round(out.get("total_cost_usd") or 0, 4)
    if out.get("subtype") != "success" or out.get("is_error"):
        return turns, cost, out.get("subtype", "error").replace("error_", "")
    data = parse_json_result(out.get("result"))
    if data is None:
        return turns, cost, "bad-output"
    data["updated_at"] = stamp()
    if r.get("output"):
        write_json(resolve(r["output"]), data)
    post = POST.get(r.get("post"))
    if post:
        post(data)
    return turns, cost, "ok"


def post_inbox(data):
    """Store the triage result inside each captured note."""
    for res in data.get("results", []):
        nid = str(res.get("id", ""))
        path = os.path.join(INBOX, f"{nid}.json")
        if not re.fullmatch(r"\d{8}T\d{6}-[0-9a-f]{6}", nid) or not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            note = json.load(f)
        note.update(status="triaged", triage=res, triaged_at=stamp())
        write_json(path, note)


def post_metrics(data):
    """History for the Business page: one point per day. Today's reading replaces any earlier one;
    history reconstructed by the routine only fills dates that are still missing."""
    hist = config.path("state", "metrics-history.jsonl")
    points = {}
    if os.path.exists(hist):
        with open(hist, encoding="utf-8") as f:
            for line in f:
                try:
                    p = json.loads(line)
                    points[p["date"]] = p
                except (ValueError, KeyError):
                    pass
    clean = lambda prods: [{"name": str(p.get("name", "?"))[:60], "active": p.get("active"), "mrr": p.get("mrr")}
                           for p in prods or [] if isinstance(p, dict)]
    for h in data.get("history") or []:
        if isinstance(h, dict) and re.fullmatch(r"\d{4}-\d\d-\d\d", str(h.get("date", ""))) and h["date"] not in points:
            prods = clean(h.get("products"))
            points[h["date"]] = {"date": h["date"], "products": prods, "reconstructed": True,
                                 "mrr": round(sum(p["mrr"] or 0 for p in prods), 2),
                                 "active_subscriptions": sum(p["active"] or 0 for p in prods)}
    day = datetime.now().date().isoformat()
    points[day] = {"date": day, "products": clean(data.get("products")),
                   **{k: data.get(k) for k in ("currency", "mrr", "active_subscriptions", "revenue_30d")}}
    os.makedirs(os.path.dirname(hist), exist_ok=True)
    with open(hist + ".tmp", "w", encoding="utf-8") as f:
        f.writelines(json.dumps(points[d], ensure_ascii=False) + "\n" for d in sorted(points)[-400:])
    os.replace(hist + ".tmp", hist)


POST = {"inbox": post_inbox, "metrics": post_metrics}


def capped(rows, caps, now):
    use = cap_usage(rows, caps, now)
    return use["runs_today"] >= caps["daily_runs"] or use["runs_in_window"] >= caps["window_runs"]


def log_capped_once(rows, r, since):
    last = next((x for x in reversed(rows) if x["name"] == r["name"]), None)
    if not (last and last["status"] == "capped" and datetime.fromisoformat(last["time"]) >= since):
        append_log(r["name"], r.get("model", "-"), 0, 0, "capped")


def execute(r, reg, cfg, params=None):
    t0 = time.monotonic()
    turns, cost, status = run_command(r, params) if "command" in r else run_claude(r, reg, cfg, params)
    append_log(r["name"], r.get("model", "-"), turns, cost, status, round(time.monotonic() - t0))


def valid_params(r, params):
    """Every parameter must be declared by the routine and fully match its regex (the server checks too)."""
    if not isinstance(params, dict):
        return False
    spec = r.get("params") or {}
    return all(k in spec and isinstance(v, str) and re.fullmatch(spec[k], v) for k, v in params.items())


def pending_requests():
    if not os.path.isdir(QUEUE):
        return []
    out = []
    for fn in sorted(os.listdir(QUEUE)):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(QUEUE, fn)
        try:
            with open(path, encoding="utf-8") as f:
                out.append((path, json.load(f)))
        except (OSError, ValueError):
            continue
    return out


def summary(rows, day):
    mine = [r for r in counted(rows) if r["time"].startswith(day)]
    return {"ok": sum(r["status"] == "ok" for r in mine),
            "errors": sum(r["status"] != "ok" for r in mine),
            "cost": round(sum(float(r["cost"] or 0) for r in mine), 2)}


def status_payload(reg, rows, caps, now, cfg):
    today, yesterday = now.date().isoformat(), (now - timedelta(days=1)).date().isoformat()
    routines = []
    for r in reg["routines"]:
        enabled = r.get("enabled", True) and requirement_met(r, cfg)
        last = next((x for x in reversed(rows) if x["name"] == r["name"] and x["status"] != "capped"), None)
        nxt = next_slot(r["schedule"], now) if enabled and r.get("schedule") else None
        routines.append({
            "name": r["name"], "label": r.get("label"), "description": r.get("description"),
            "schedule": r.get("schedule"), "machine": r.get("machine", "*"),
            "enabled": enabled, "llm": "command" not in r, "internal": r.get("internal", False), "deck": r.get("deck", False),
            "params": sorted((r.get("params") or {}).keys()),
            "next_run": nxt.isoformat() if nxt else None,
            "scheduled_today": bool(enabled and r.get("schedule") and last_slot(r["schedule"], now.replace(hour=23, minute=59), 24)),
            "fired_today": bool(last and last["time"].startswith(today) and last["status"] == "ok"),
            "last": last,
        })
    return {
        "updated_at": stamp(), "machine": cfg["machine"],
        "caps": cap_usage(rows, caps, now),
        "routines": routines,
        "fired_today": sum(r["fired_today"] for r in routines),
        "scheduled_today": sum(r["scheduled_today"] for r in routines),
        "today": summary(rows, today), "yesterday": summary(rows, yesterday),
        "queue": [req.get("routine") for _, req in pending_requests()],
        "recent": list(reversed(rows[-15:])),
    }


def side_jobs(cfg):
    """Light jobs on every tick. None of them may ever block the routines."""
    if cfg.get("mail", {}).get("enabled"):
        try:  # new mail: listed every interval_min during the day, analysed only when something is new
            import mail_watch
            mail_watch.main()
        except Exception as e:
            print(f"mail_watch: {e}", file=sys.stderr)
    if cfg.get("topbar", {}).get("claude_usage") and cfg.get("claude_plan") != "api":
        try:  # Claude quota: a tiny probe when the last reading is older than 15 min (never at night)
            import usage_probe
            usage_probe.main()
        except Exception as e:
            print(f"usage_probe: {e}", file=sys.stderr)
    for name in ("build_today", "build_brain"):  # optional builders: skipped when absent or broken
        try:
            __import__(name).main()
        except ImportError:
            continue
        except Exception as e:
            print(f"{name}: {e}", file=sys.stderr)


def main():
    lock = open(os.path.join(HERE, ".lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 0  # a previous tick is still running

    cfg = config.load()
    with open(REGISTRY, encoding="utf-8") as f:
        reg = json.load(f)
    caps = reg["caps"]
    by_name = {r["name"]: r for r in reg["routines"]}
    forced = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--now" else None
    now = datetime.now()

    # 1. Scheduled routines (or the one forced on the command line)
    for r in reg["routines"]:
        if not for_this_machine(r, cfg) or not requirement_met(r, cfg):
            continue
        rows = read_log()
        if forced:
            if r["name"] != forced:
                continue
            slot = now
        else:
            if not r.get("enabled", True) or not r.get("schedule"):
                continue  # disabled, or on demand only
            slot = last_slot(r["schedule"], now, r.get("catch_up_hours", 1))
            if slot is None:
                continue
            mine = [x for x in rows if x["name"] == r["name"]]
            if any(datetime.fromisoformat(x["time"]) >= slot and x["status"] != "capped" for x in mine):
                continue  # already done for this slot
        if capped(rows, caps, now):
            log_capped_once(rows, r, slot)
            continue
        execute(r, reg, cfg)

    # 2. Manual requests from the dashboard (only those this machine handles)
    for path, req in pending_requests():
        r = by_name.get(req.get("routine"))
        if r is None or not requirement_met(r, cfg):
            append_log(str(req.get("routine"))[:64], "-", 0, 0, "unknown-routine" if r is None else "disabled")
            os.remove(path)
            continue
        if not for_this_machine(r, cfg):
            continue  # another machine handles it
        params = req.get("params") or {}
        if not valid_params(r, params):
            append_log(r["name"], r.get("model", "-"), 0, 0, "bad-params")
            os.remove(path)
            continue
        rows = read_log()
        try:
            since = datetime.fromisoformat(req["requested_at"]).replace(tzinfo=None)
        except (KeyError, ValueError, TypeError):
            since = datetime.now()
        if capped(rows, caps, datetime.now()):
            log_capped_once(rows, r, since)
            continue  # stays queued until the caps allow it
        execute(r, reg, cfg, params)
        os.remove(path)  # removed once the run is logged

    write_json(STATUS, status_payload(reg, read_log(), caps, datetime.now(), cfg))
    side_jobs(cfg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
