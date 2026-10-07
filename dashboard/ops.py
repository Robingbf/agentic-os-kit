"""Inventory of everything the OS does on its own, with measured frequencies and costs (dashboard Settings page).

Costs come from the logs (estimated public API price; on a Claude subscription this is quota used, not money spent).
Runs per day: computed from the schedule (cron, interval) or, for event-driven work, observed over the last 7 days.
"""
import json
import os
import sys
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "routines"))
import config  # noqa: E402

try:
    import run as runner  # noqa: E402  (runner's cron matcher and run log)
except Exception:  # the runner is broken or missing: the page still renders, without measured runs
    runner = None

DAYS = 7  # cost observation window
# Claude subscription list prices, USD per month (team / enterprise / api: unknown)
PLAN_PRICES = {"pro": 20, "max5": 100, "max20": 200}
PERIODS = {"month": 1, "year": 1 / 12, "week": 52 / 12}


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def read_tsv(path, cost_col, name_col=1):
    """[(date, name, cost)] from a TSV log."""
    out = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) > max(cost_col, name_col):
                    try:
                        out.append((p[0], p[name_col], float(p[cost_col] or 0)))
                    except ValueError:
                        pass
    except OSError:
        pass
    return out


def stats(rows, since):
    recent = [r for r in rows if r[0] >= since]
    n, total = len(recent), sum(r[2] for r in recent)
    return {"runs_7d": n, "cost_7d": round(total, 3), "avg_cost": round(total / n, 4) if n else None,
            "last": max((r[0] for r in rows), default=None)}


def per_day_cron(schedule):
    """How many times a cron schedule fires per day (on a typical weekday)."""
    if not schedule or runner is None:
        return 0
    day = datetime(2026, 10, 7)  # a Wednesday
    try:
        return sum(runner.matches(schedule, day + timedelta(minutes=m)) for m in range(1440))
    except Exception:
        return 0


def human_schedule(expr):
    parts = expr.split()
    if len(parts) == 5:
        mi, h, dom, mon, dow = parts
        if mi.isdigit() and h.isdigit() and dom == mon == dow == "*":
            return f"daily at {int(h):02d}:{int(mi):02d}"
    return expr


def subscription(cfg):
    """Claude subscription per month: from the expenses (state/costs.json, item named "claude"), else the plan's list price."""
    cur = cfg.get("currency", {})
    usd_rate = float(cur.get("usd_rate", 1.0)) or 1.0
    costs = read_json(os.path.join(ROOT, "state", "costs.json"), {})
    fx = costs.get("fx") or {cur.get("code", "USD"): 1, "USD": usd_rate}
    item = next((c for c in costs.get("items", []) if "claude" in (c.get("name") or "").lower() and c.get("amount")), None)
    if item and item.get("period") in PERIODS:
        local = item["amount"] * fx.get(item.get("currency", cur.get("code", "USD")), 1) * PERIODS[item["period"]]
        usd = local / (fx.get("USD") or usd_rate)
        return {"name": item["name"], "source": "costs", "local": round(local, 2), "usd": round(usd, 2), "usd_rate": usd_rate}
    plan = cfg.get("claude_plan")
    if plan in PLAN_PRICES:
        usd = PLAN_PRICES[plan]
        return {"name": f"Claude {plan}", "source": "plan", "local": round(config.usd_to_local(usd, cfg), 2), "usd": usd, "usd_rate": usd_rate}
    return None


def build():
    cfg = config.load()
    since = (datetime.now() - timedelta(days=DAYS)).isoformat()
    items = []
    try:
        runs = runner.read_log() if runner else []
    except Exception:
        runs = []
    reg = read_json(os.path.join(ROOT, "routines", "registry.json"), {"routines": [], "caps": {}})
    money = lambda usd, digits=2: config.money(usd, digits, cfg)

    def add(group, name, what, when, model, per_day, rows, log, enabled=True, note=None, observed=False):
        s = stats(rows, since)
        if observed:  # event-driven: observed frequency
            per_day = round(s["runs_7d"] / DAYS, 1)
        avg = s["avg_cost"] or 0
        items.append({"group": group, "name": name, "what": what, "when": when, "model": model, "enabled": enabled,
                      "per_day": per_day, "avg_cost": s["avg_cost"], "est_day": round(avg * per_day, 3), "est_month": round(avg * per_day * 30, 2),
                      "runs_7d": s["runs_7d"], "cost_7d": s["cost_7d"], "last": s["last"], "log": log, "note": note})

    # 1. registry routines
    for r in reg.get("routines", []):
        if r.get("requires") == "mail" and not cfg.get("mail", {}).get("enabled"):
            continue  # mail routines are inert while mail is disabled
        rows = []
        for x in runs:
            if x.get("name") == r.get("name") and x.get("status") != "capped":
                try:
                    rows.append((x["time"], x["name"], float(x.get("cost") or 0)))
                except (KeyError, ValueError):
                    pass
        sched = r.get("schedule")
        model = r.get("model", "-")
        group = "Scheduled" if sched else "On demand"
        when = human_schedule(sched) if sched else ("triggered by a dashboard action" if r.get("internal") else "▶ button in the skills deck")
        add(group, r.get("label") or r["name"], r.get("description", ""), when, "no AI" if model == "-" else model,
            per_day_cron(sched), rows, "routines/runs.log", r.get("enabled", True), observed=not sched)

    # 2. continuous work done at each runner tick, at its own pace
    mail = cfg.get("mail", {})
    if mail.get("enabled"):
        w = mail.get("watch", {})
        start, end, every = int(w.get("day_start", 7)), int(w.get("day_end", 23)), max(1, int(w.get("interval_min", 30)))
        log_path = os.path.join(ROOT, "state", "mail-watch.log")
        mlines = []
        try:
            with open(log_path, encoding="utf-8") as f:
                mlines = [l.rstrip("\n").split("\t") for l in f]
        except OSError:
            pass

        def num(p, i):
            try:
                return float(p[i])
            except (IndexError, ValueError):
                return 0.0
        # columns 5 and 6: cost of the check and of the analysis
        full = [p for p in mlines if len(p) > 5]
        checks = [num(p, 4) for p in full]
        analysed = [(p[0], num(p, 5)) for p in full if num(p, 5) > 0]
        check_avg = sum(checks) / len(checks) if checks else 0.04
        extra_avg = sum(c for _, c in analysed) / len(analysed) if analysed else 0.2
        batches_day = max(1.0, len([d for d, _ in analysed if d >= since]) / DAYS)  # at least one batch of new mail per day
        checks_day = round(max(0, end - start) * 60 / every)
        mail_est = check_avg * checks_day + extra_avg * batches_day
        add("Continuous", "New mail check", "Haiku lists recent threads and the ones you replied to; Sonnet analyses only new ones "
            "(area, suggestions, actions, who is waiting on you) and notifies. A thread you reply to leaves \"Waiting on you\".",
            f"every {every} min, from {start}:00 to {end}:00", "Haiku + Sonnet if new",
            checks_day, read_tsv(log_path, 2), "state/mail-watch.log",
            note=f"check ≈ {money(check_avg, 3)} × {checks_day}/day + analysis ≈ {money(extra_avg)} × {batches_day:.1f} batch(es)/day")
        items[-1].update(avg_cost=round(check_avg, 4), est_day=round(mail_est, 3), est_month=round(mail_est * 30, 2))
    add("Continuous", "Claude quota check", "Minimal probe (no tools, no connectors) that reads the remaining 5-hour / weekly quota.",
        "every 15 min while the runner is active, unless another session just read it", "Haiku", round(18 * 4 * 0.6),
        read_tsv(os.path.join(ROOT, "state", "usage-probe.log"), 2), "state/usage-probe.log",
        note="real frequency is lower: routines and the chat also read the quota")
    add("Continuous", "Routine runner", "Checks what is due (schedule + queue), writes the routines status and the Today data (milestones, projects, costs).",
        "every 5 min (scheduler)", "no AI", 288, [], "routines/runs.log")

    # 3. event-driven
    add("Event", "Session journal", "At the end of each Claude Code session in a project: summarises it, notes where you stopped and updates the tasks.",
        "at the end of each Claude Code session (SessionEnd hook)", "Haiku", 0,
        read_tsv(os.path.join(ROOT, "state", "sessions", "sessions.log"), 3), "state/sessions/sessions.log", observed=True)
    add("Event", "Dashboard chat (\"/\")", "Your conversations with Claude from the palette: reads your files, edits only the OS folder.",
        "on each message sent", "Sonnet", 0, read_tsv(os.path.join(ROOT, "state", "chat", "chat.log"), 2), "state/chat/chat.log", observed=True)
    add("Event", "Session start context", "Injects the project journal at the start of each Claude Code session (SessionStart hook).",
        "at each Claude Code session start", "no AI", 0, [], "—", note="free")
    add("Event", "Claude Code status line", "Shows the quota in the terminal and passes it to the dashboard.", "on each exchange in the terminal",
        "no AI", 0, [], "—", note="free")

    # 4. dashboard (browser, free)
    for name, every in (("Dashboard data", "every 60 s"), ("Machine health", "every 15 s"), ("Claude quota (display)", "every 30 s"),
                        ("Server status", "every 15 s"), ("Brain", "every 5 min")):
        items.append({"group": "Dashboard", "name": name, "what": "Local re-read by the open page (no call to Claude).", "when": every,
                      "model": "no AI", "enabled": True, "per_day": None, "avg_cost": 0, "est_day": 0, "est_month": 0, "runs_7d": None,
                      "cost_7d": 0, "last": None, "log": "—", "note": "free, only while the dashboard is open"})

    usage = read_json(os.path.join(ROOT, "state", "usage.json"), None)
    try:
        import plan_value
        plan = plan_value.estimate()
    except Exception:
        plan = None
    cur = cfg.get("currency", {})
    return {"subscription": subscription(cfg), "usage": usage, "plan": plan,
            "currency": {"code": cur.get("code", "USD"), "symbol": cur.get("symbol", "$")}, "fx_usd": float(cur.get("usd_rate", 1.0)),
            "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"), "items": items, "window_days": DAYS,
            "totals": {"est_day": round(sum(i["est_day"] for i in items), 2), "est_month": round(sum(i["est_month"] for i in items), 2),
                       "actual_7d": round(sum(i["cost_7d"] or 0 for i in items), 2)},
            "caps": {**reg.get("caps", {}), "note": "registry routine caps (protect the quota if something runs away)"}}


if __name__ == "__main__":
    print(json.dumps(build(), ensure_ascii=False, indent=1))
