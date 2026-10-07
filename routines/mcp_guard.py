"""Load only the MCP connectors each automatic session actually needs.

With every connector loaded (some servers expose hundreds of tools), an unattended session can overflow the
model's context ("Prompt is too long") and costs a lot for nothing. So every MCP server a routine does not use
is denied as a whole. The list of known servers grows by itself: each session's `init` event lists its tools,
and new servers (and tool names) are remembered in state/mcp-servers.json and state/mcp-tools.json.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

KNOWN = config.path("state", "mcp-servers.json")
TOOLS = config.path("state", "mcp-tools.json")
# Common connector prefixes (claude.ai connectors and popular local servers). Denying an absent server is harmless.
SEED = [
    "mcp__claude_ai_Gmail", "mcp__claude_ai_Google_Calendar", "mcp__claude_ai_Google_Drive", "mcp__claude_ai_Notion",
    "mcp__claude_ai_Slack", "mcp__claude_ai_Figma", "mcp__claude_ai_Linear", "mcp__claude_ai_Asana", "mcp__claude_ai_Atlassian",
    "mcp__claude_ai_Canva", "mcp__claude_ai_HubSpot", "mcp__claude_ai_Stripe", "mcp__claude_ai_Intercom", "mcp__claude_ai_Box",
    "mcp__claude_ai_Zapier", "mcp__claude_ai_Make", "mcp__claude_ai_Cloudflare", "mcp__claude_ai_Sentry", "mcp__claude_ai_Vercel",
    "mcp__claude_ai_Supabase", "mcp__claude_ai_PayPal", "mcp__claude_ai_Square", "mcp__claude_ai_Monday", "mcp__claude_ai_ClickUp",
    "mcp__claude_ai_Airtable", "mcp__claude_ai_Dropbox", "mcp__claude_ai_Microsoft_365", "mcp__claude_ai_Outlook",
    "mcp__github", "mcp__gitlab", "mcp__supabase", "mcp__stripe", "mcp__posthog", "mcp__sentry", "mcp__playwright",
    "mcp__puppeteer", "mcp__filesystem", "mcp__slack", "mcp__notion", "mcp__linear", "mcp__figma", "mcp__resend",
]


def _read(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1)
    os.replace(path + ".tmp", path)


def known():
    learned = _read(KNOWN, [])
    return sorted(set(SEED) | set(learned if isinstance(learned, list) else []))


def server_of(tool):
    return "__".join(tool.split("__")[:2]) if tool.startswith("mcp__") else None


def deny_for(allowed_tools):
    """MCP servers to deny: every known server the routine does not use."""
    needed = {server_of(t) for t in allowed_tools if server_of(t)}
    return [s for s in known() if s not in needed]


def denied_by_pattern(patterns, allowed_tools):
    """Known tools of the servers a routine uses whose short name matches a deny pattern (send, delete, share…).
    Tools the routine lists explicitly in allowed_tools stay allowed."""
    if not patterns:
        return []
    needed = {server_of(t) for t in allowed_tools if server_of(t)}
    tools = _read(TOOLS, {})
    out = []
    for server in needed:
        for tool in tools.get(server, []) if isinstance(tools, dict) else []:
            short = tool.split("__", 2)[-1]
            if tool not in allowed_tools and any(re.search(p, short) for p in patterns):
                out.append(tool)
    return sorted(out)


def learn(stream_lines):
    """Remember the MCP servers and tools listed in a session's init event."""
    names = []
    for line in stream_lines:
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "system" and d.get("subtype") == "init":
            names = [t for t in d.get("tools", []) if isinstance(t, str) and t.startswith("mcp__")]
            break
    if not names:
        return
    seen = {server_of(t) for t in names}
    if seen - set(known()):
        _write(KNOWN, sorted(set(known()) | seen))
    tools = _read(TOOLS, {})
    tools = tools if isinstance(tools, dict) else {}
    changed = False
    for t in names:
        s = server_of(t)
        if t not in tools.setdefault(s, []):
            tools[s].append(t)
            changed = True
    if changed:
        _write(TOOLS, {k: sorted(v) for k, v in sorted(tools.items())})
