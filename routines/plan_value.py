#!/usr/bin/env python3
"""Estimate what the Claude subscription is worth in token dollars (public API prices).

Method: add up what ALL Claude Code sessions (yours + the OS's) consumed since the start of the current quota
window, at public prices, then divide by the share of the quota already used.
  capacity ~= cost consumed since the window started / share used
Limit: Claude usage outside Claude Code (claude.ai web/desktop chat) counts against the quota but not in the
cost measured here, so the real capacity is then larger than the estimate.
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

# USD per million tokens: (input, output, cache read). Public prices, claude-api reference of 2026-09-25.
PRICES = {"opus-5-5": (4, 20, 0.20), "sonnet-5-5": (2, 10, 0.20), "haiku-4-5": (1, 5, 0.10), "fable-5": (10, 50, 0.25),
          "opus-5": (5, 25, 0.50), "sonnet-5": (2, 10, 0.20), "opus-4": (5, 25, 0.50), "sonnet-4": (3, 15, 0.30)}
# Monthly list price of each plan in USD (for the "value vs price" ratio); None = pay as you go / negotiated.
PLAN_PRICES_USD = {"pro": 20, "max5": 100, "max20": 200, "team": 30, "enterprise": None, "api": None}
PROJECTS = os.path.expanduser("~/.claude/projects")
USAGE = config.path("state", "usage.json")


def price(model):
    m = (model or "").replace("claude-", "")
    return next((v for k, v in PRICES.items() if m.startswith(k)), None)


def cost_since(since_ts):
    """API-price cost of every Claude Code response since `since_ts` (epoch seconds)."""
    seen, total, by_model = set(), 0.0, {}
    if not os.path.isdir(PROJECTS):
        return total, by_model
    for path in glob.glob(os.path.join(PROJECTS, "*", "*.jsonl")):
        try:
            if os.path.getmtime(path) < since_ts:
                continue
            f = open(path, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with f:
            for line in f:
                if '"usage"' not in line or '"assistant"' not in line:
                    continue
                try:
                    d = json.loads(line)
                    if d.get("type") != "assistant":
                        continue
                    ts = d.get("timestamp")
                    if not ts or datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() < since_ts:
                        continue
                except (ValueError, AttributeError):
                    continue
                m = d.get("message") or {}
                key = (m.get("id"), d.get("requestId"))
                if key in seen:  # the same response can appear several times (blocks, resumed sessions)
                    continue
                seen.add(key)
                p, u = price(m.get("model")), m.get("usage") or {}
                if not p:
                    continue
                cc = u.get("cache_creation") or {}
                w5, w1 = cc.get("ephemeral_5m_input_tokens", 0), cc.get("ephemeral_1h_input_tokens", 0)
                if not (w5 or w1):
                    w5 = u.get("cache_creation_input_tokens", 0)
                c = (u.get("input_tokens", 0) * p[0] + u.get("output_tokens", 0) * p[1] + u.get("cache_read_input_tokens", 0) * p[2]
                     + w5 * p[0] * 1.25 + w1 * p[0] * 2) / 1e6
                total += c
                by_model[m.get("model")] = by_model.get(m.get("model"), 0) + c
    return total, by_model


def estimate():
    cfg = config.load()
    plan = cfg.get("claude_plan") or "pro"
    if plan == "api":
        return None  # no subscription quota to compare with
    try:
        with open(USAGE, encoding="utf-8") as f:
            u = json.load(f)
    except (OSError, ValueError):
        return None
    out = {"at": datetime.now().astimezone().isoformat(timespec="seconds"), "plan": plan,
           "plan_price_usd": PLAN_PRICES_USD.get(plan)}
    for key, hours in (("seven_day", 168), ("five_hour", 5)):
        w = u.get(key) or {}
        used, reset = w.get("used_percentage"), w.get("resets_at")
        if not used or not isinstance(reset, (int, float)):
            continue
        start = reset - hours * 3600
        spent, by_model = cost_since(start)
        out[key] = {"used_pct": used, "window_start": datetime.fromtimestamp(start, timezone.utc).astimezone().isoformat(timespec="minutes"),
                    "spent_usd": round(spent, 2), "capacity_usd": round(spent / (used / 100), 0) if used >= 2 else None,
                    "by_model": {k: round(v, 2) for k, v in sorted(by_model.items(), key=lambda x: -x[1])}}
    return out


if __name__ == "__main__":
    print(json.dumps(estimate(), ensure_ascii=False, indent=1))
