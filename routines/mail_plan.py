"""The user's mail filing plan: single source for the prompts (digest, mail watch), the dashboard server's
validation (the "File" button) and the gmail-apply action.

Labels come from os.config.json -> mail.labels: [{"name": "Work/Clients", "description": "client conversations"}].
Each label must exist in the mailbox under that exact name. mail.fallback_by_area maps an area id to a label.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


def plan(cfg=None):
    """[(label, description)] from the config."""
    labels = (cfg or config.load()).get("mail", {}).get("labels") or []
    out = []
    for item in labels:
        if isinstance(item, str):
            out.append((item, ""))
        elif isinstance(item, dict) and item.get("name"):
            out.append((str(item["name"]), str(item.get("description", ""))))
    return out


def labels(cfg=None):
    return [name for name, _ in plan(cfg)]


def plan_text(cfg=None):
    """Plan as a bullet list for prompts; empty string when no label is configured."""
    cfg = cfg or config.load()
    lines = [f'- "{name}"' + (f": {desc}" if desc else "") for name, desc in plan(cfg)]
    fallback = cfg.get("mail", {}).get("fallback_by_area") or {}
    if lines and fallback:
        lines.append("Default label per area when nothing more specific fits: " +
                     ", ".join(f'{area} -> "{label}"' for area, label in fallback.items()))
    return "\n".join(lines)


def _key(label):
    return re.sub(r"^\s*\d+[/.)]?\s*|(?<=/)\s*\d+[/.)]?\s*", "", label or "").strip().lower()


def canonical(label, cfg=None):
    """Exact plan name for a label (tolerates case and leading numbering), else None."""
    k = _key(label)
    return next((name for name in labels(cfg) if _key(name) == k), None) if k else None
