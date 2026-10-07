"""Shared loader for os.config.json: every script imports this instead of reading the file itself.

Missing keys fall back to os.config.example.json, so the OS keeps working while setup is in progress.
"""
import copy
import json
import os
import socket

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "os.config.json")
EXAMPLE = os.path.join(ROOT, "os.config.example.json")


def _merge(base, over):
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load():
    try:
        with open(EXAMPLE, encoding="utf-8") as f:
            base = json.load(f)
    except (OSError, ValueError):
        base = {}
    try:
        with open(CONFIG, encoding="utf-8") as f:
            cfg = _merge(base, json.load(f))
    except (OSError, ValueError):
        cfg = base
    if not cfg.get("machine"):
        cfg["machine"] = socket.gethostname().split(".")[0]
    cfg["off_limits"] = [os.path.expanduser(p) for p in cfg.get("off_limits", [])]
    cfg["search_roots"] = [os.path.expanduser(p) for p in cfg.get("search_roots", ["~"])]
    return cfg


def path(*parts):
    """Absolute path inside the OS folder."""
    return os.path.join(ROOT, *parts)


def expand(value):
    """Replace {ROOT} in registry strings (commands, outputs)."""
    return value.replace("{ROOT}", ROOT) if isinstance(value, str) else value


def area_ids(cfg=None):
    return [a["id"] for a in (cfg or load()).get("areas", [])]


def usd_to_local(usd, cfg=None):
    c = (cfg or load()).get("currency", {})
    return usd * float(c.get("usd_rate", 1.0))


def money(usd, digits=2, cfg=None):
    c = (cfg or load()).get("currency", {})
    return f"{usd_to_local(usd, cfg):.{digits}f} {c.get('symbol', '$')}"
