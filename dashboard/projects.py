"""Projects page: one file per project, projects/<id>.json (single home of its tasks, ideas and status).

Used by the dashboard server (read + validated edits); any Claude session may also edit the files (format in CLAUDE.md).
Statuses, task columns and importance levels come from os.config.json → "projects" (defaults below), so the page is
a base each user adapts. Two ids keep a meaning: the FIRST status is the "ideas" stage (idea sheet), and the column
"done" means completed.

Sync with the rest of the OS (every read):
  - session journals (state/sessions/<id>.md): new open tasks → first column, tasks done → "done",
    "## Next time" → the project's "Next time" banner (only when the journal text changes);
  - captured ideas (state/ideas/<id>.md, written by Capture's filing) → Ideas tab;
  - milestones: goals.json (read only, it stays their home).
Every imported item is remembered ("imported"): deleted here, it never comes back.
"""
import json
import os
import re
import sys
import threading
import unicodedata
import uuid
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "routines"))
import config  # noqa: E402

DIR = os.path.join(ROOT, "projects")
SESSIONS = os.path.join(ROOT, "state", "sessions")
IDEAS = os.path.join(ROOT, "state", "ideas")
DELETED = os.path.join(ROOT, "state", "projects-deleted")
GOALS = os.path.join(ROOT, "goals.json")
LOCK = threading.Lock()

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,29}$")      # same rule as area ids (colours in state/prefs.json)
KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,23}$")     # status / column / importance ids
ICON_RE = re.compile(r"^[a-z0-9-]{1,40}$")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DATE_RE = re.compile(r"^\d{4}-\d\d-\d\d$")
DONE = "done"
# Journal headings written by hooks/session_journal.py
H_LAST, H_NEXT, H_OPEN, H_DONE = "Last session", "Next time", "Open tasks", "Done recently"

DEFAULTS = {
    "statuses": [
        {"id": "ideas", "label": "Ideas", "icon": "lightbulb"},
        {"id": "dev", "label": "In development", "icon": "code"},
        {"id": "launch", "label": "Launch", "icon": "rocket-launch"},
        {"id": "live", "label": "Live", "icon": "globe"},
        {"id": "paused", "label": "Paused", "icon": "pause"},
    ],
    "columns": [
        {"id": "inbox", "label": "To triage", "hint": "new tasks (sessions, ideas)"},
        {"id": "todo", "label": "To do"},
        {"id": "doing", "label": "In progress"},
        {"id": "blocked", "label": "Blocked"},
        {"id": "done", "label": "Done"},
    ],
    "importance": [
        {"id": "low", "label": "Low", "color": "#8a8781"},
        {"id": "medium", "label": "Medium", "color": "#f2b84b"},
        {"id": "high", "label": "High", "color": "#ff5a4f"},
        {"id": "urgent", "label": "Urgent", "color": "#ff2d6f"},
    ],
}


class Invalid(ValueError):
    pass


# ---------- configurable schema ----------
def _items(raw, fallback, extra):
    """Clean list of {id, label, ...} from os.config.json; the default list if missing or unusable."""
    out, seen = [], set()
    for x in raw if isinstance(raw, list) else []:
        if not isinstance(x, dict) or not isinstance(x.get("id"), str) or not KEY_RE.match(x["id"]) or x["id"] in seen:
            continue
        item = {"id": x["id"], "label": str(x.get("label") or x["id"])[:40]}
        for k, rule in extra.items():
            v = x.get(k)
            if isinstance(v, str) and (rule is None or rule.match(v)):
                item[k] = v[:120]
        seen.add(x["id"])
        out.append(item)
    return out or [dict(x) for x in fallback]


def schema(cfg=None):
    """Statuses, columns and importance levels in use (os.config.json → projects, else the defaults)."""
    p = (cfg or config.load()).get("projects")
    p = p if isinstance(p, dict) else {}
    s = {"statuses": _items(p.get("statuses"), DEFAULTS["statuses"], {"icon": ICON_RE}),
         "columns": _items(p.get("columns"), DEFAULTS["columns"], {"hint": None}),
         "importance": _items(p.get("importance"), DEFAULTS["importance"], {"color": COLOR_RE})}
    for i, x in enumerate(s["importance"]):
        x.setdefault("color", DEFAULTS["importance"][min(i, 3)]["color"])
    s["idea_status"] = s["statuses"][0]["id"]
    s["start_status"] = s["statuses"][1]["id"] if len(s["statuses"]) > 1 else s["statuses"][0]["id"]
    cols = [c["id"] for c in s["columns"]]
    open_cols = [c for c in cols if c != DONE] or cols
    s["inbox_column"] = open_cols[0]
    s["new_column"] = "todo" if "todo" in cols else open_cols[0]
    s["done_column"] = DONE if DONE in cols else None
    imps = [x["id"] for x in s["importance"]]
    s["default_importance"] = "medium" if "medium" in imps else imps[(len(imps) - 1) // 2]
    return s


def _ids(lst):
    return [x["id"] for x in lst]


# ---------- files ----------
def _now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _key(text):
    """Comparison key of a text (duplicates): lower case, no punctuation, single spaces."""
    return re.sub(r"[^\w]+", " ", str(text).lower()).strip()


def _new_id(prefix):
    return f"{prefix}{uuid.uuid4().hex[:8]}"


def path(pid):
    return os.path.join(DIR, f"{pid}.json")


def ids():
    if not os.path.isdir(DIR):
        return []
    return sorted(f[:-5] for f in os.listdir(DIR) if f.endswith(".json") and ID_RE.match(f[:-5]))


def load(pid, sch):
    if not ID_RE.match(pid or ""):
        return None
    try:
        with open(path(pid), encoding="utf-8") as f:
            p = json.load(f)
    except (OSError, ValueError):
        return None
    if not isinstance(p, dict):
        return None
    p["id"] = pid
    p.setdefault("label", pid)
    p.setdefault("status", sch["start_status"])
    for k, v in (("objective", ""), ("for_whom", ""), ("problem", ""), ("notes", ""), ("next_time", ""), ("next_time_at", ""),
                 ("links", []), ("tasks", []), ("ideas", []), ("imported", {}), ("order", 0)):
        if not isinstance(p.get(k), type(v)):
            p[k] = v
    p["imported"].setdefault("tasks", [])
    p["imported"].setdefault("ideas", [])
    # values left over from an older config (renamed or removed status / column / importance): shown, not lost
    if p["status"] not in _ids(sch["statuses"]):
        p["status"] = sch["start_status"]
    cols, imps = _ids(sch["columns"]), _ids(sch["importance"])
    tasks = []
    for t in p["tasks"]:
        if not isinstance(t, dict) or not str(t.get("title", "")).strip():
            continue
        t.setdefault("id", _new_id("t"))
        if t.get("col") not in cols:
            t["col"] = sch["inbox_column"]
        if t.get("importance") not in imps:
            t["importance"] = sch["default_importance"]
        for k, v in (("due", ""), ("tags", []), ("notes", ""), ("source", "file"), ("created", "")):
            if not isinstance(t.get(k), type(v)):
                t[k] = v
        tasks.append(t)
    p["tasks"] = tasks
    p["ideas"] = [i for i in p["ideas"] if isinstance(i, dict) and str(i.get("text", "")).strip()]
    for i in p["ideas"]:
        i.setdefault("id", _new_id("i"))
        i.setdefault("task", "")
        i.setdefault("source", "file")
        i.setdefault("created", "")
    return p


def save(p):
    os.makedirs(DIR, exist_ok=True)
    p["updated_at"] = _now()
    tmp = path(p["id"]) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path(p["id"]))


# ---------- sync with the rest of the OS ----------
def _journal(pid):
    try:
        with open(os.path.join(SESSIONS, f"{pid}.md"), encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return {}

    def sec(name):
        return text.split(f"## {name}\n", 1)[1].split("\n## ", 1)[0] if f"## {name}\n" in text else ""

    last = sec(H_LAST).strip().splitlines()
    when = summary = stopped = ""
    if last:
        m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d) · (.*)", last[0])
        if m:
            when, summary = m.groups()
        stopped = next((ln.split(":", 1)[1].strip() for ln in last[1:] if ln.startswith("Stopped at")), "")
    return {"when": when, "summary": summary, "stopped_at": stopped,
            "open": re.findall(r"(?m)^- \[ \] (.+)$", sec(H_OPEN)),
            "done": re.findall(r"(?m)^- \[[xX]\] (.+)$", sec(H_DONE)),
            "next": sec(H_NEXT).strip()}


def _ideas_file(pid):
    try:
        with open(os.path.join(IDEAS, f"{pid}.md"), encoding="utf-8") as f:
            return [re.sub(r"\s*\(captured [^)]*\)\s*$", "", ln[2:].strip()) for ln in f if ln.startswith("- ")]
    except OSError:
        return []


def sync(p, sch, j=None):
    """Import what the rest of the OS produced since last time. Returns True if the project changed."""
    changed = False
    imp = p["imported"]
    have = {_key(t["title"]) for t in p["tasks"]}
    j = _journal(p["id"]) if j is None else j
    for title in j.get("open", []):
        k = _key(title)
        if k and k not in imp["tasks"] and k not in have:
            p["tasks"].append({"id": _new_id("t"), "title": title.strip()[:300], "col": sch["inbox_column"],
                               "importance": sch["default_importance"], "due": "", "tags": [], "notes": "",
                               "source": "session", "created": _now()})
            imp["tasks"].append(k)
            have.add(k)
            changed = True
    if sch["done_column"]:
        done_keys = {_key(t) for t in j.get("done", [])}
        for t in p["tasks"]:
            if t["col"] != sch["done_column"] and _key(t["title"]) in done_keys:
                t["col"], t["done_at"] = sch["done_column"], _now()
                changed = True
    if j.get("next") and j["next"] != p.get("next_imported", ""):  # only a NEW note from a session
        p["next_time"], p["next_time_at"], p["next_imported"] = j["next"][:600], j.get("when", ""), j["next"]
        changed = True
    known = {_key(i["text"]) for i in p["ideas"]}
    for text in _ideas_file(p["id"]):
        k = _key(text)
        if k and k not in imp["ideas"] and k not in known:
            p["ideas"].append({"id": _new_id("i"), "text": text[:500], "source": "capture", "created": _now(), "task": ""})
            imp["ideas"].append(k)
            known.add(k)
            changed = True
    return changed


def milestones(pid=None):
    try:
        with open(GOALS, encoding="utf-8") as f:
            ms = json.load(f).get("milestones", [])
    except (OSError, ValueError, AttributeError):
        return []
    today = date.today()
    out = []
    for m in ms if isinstance(ms, list) else []:
        if not isinstance(m, dict) or (pid and m.get("area") != pid):
            continue
        d = m.get("date")
        left = (date.fromisoformat(d) - today).days if isinstance(d, str) and DATE_RE.match(d) else None
        out.append({**m, "label": str(m.get("label", "")), "days_left": left})
    return sorted(out, key=lambda m: (m["days_left"] is None, m["days_left"] or 0))


def summary(p, sch, j):
    """What a project card shows on the board."""
    today = date.today().isoformat()
    tasks, done_col = p["tasks"], sch["done_column"]
    imps = _ids(sch["importance"])
    top, second = imps[-1], (imps[-2] if len(imps) > 1 else None)
    open_t = [t for t in tasks if t["col"] != done_col]
    ms = [m for m in milestones(p["id"]) if m["days_left"] is not None and m["days_left"] >= 0]
    # next things to do: "doing" then "todo" (or, with custom columns, every open column but the first and "blocked"),
    # in the order the user arranged them (never re-sorted); falls back to the first column ("To triage")
    cols = _ids(sch["columns"])
    work = [c for c in ("doing", "todo") if c in cols] or [c for c in cols if c not in (done_col, sch["inbox_column"], "blocked")]
    nxt = [x for c in work for x in tasks if x["col"] == c] or [x for x in tasks if x["col"] == sch["inbox_column"]]
    return {"id": p["id"], "label": p["label"], "status": p["status"], "order": p.get("order", 0),
            "objective": p.get("objective", ""), "for_whom": p.get("for_whom", ""),
            "total": len(tasks), "done": len(tasks) - len(open_t), "open": len(open_t),
            "high": sum(1 for t in open_t if t["importance"] == second),
            "urgent": sum(1 for t in open_t if t["importance"] == top),
            "blocked": sum(1 for t in open_t if t["col"] == "blocked"),
            "overdue": sum(1 for t in open_t if t.get("due") and t["due"] < today),
            "ideas": sum(1 for i in p["ideas"] if not i.get("task")),
            "milestone": ms[0] if ms else None, "next_time": p.get("next_time", ""),
            "next_tasks": [{"title": t["title"], "importance": t["importance"], "due": t.get("due", ""), "col": t["col"]} for t in nxt[:3]],
            "stopped_at": j.get("stopped_at", ""), "last_session": j.get("when", "")}


def full(p, sch, j=None):
    j = _journal(p["id"]) if j is None else j
    return {**p, "milestones": milestones(p["id"]), "journal": {k: j.get(k, "") for k in ("when", "summary", "stopped_at")},
            "schema": sch}


def list_all():
    sch = schema()
    out = []
    with LOCK:
        for pid in ids():
            p = load(pid, sch)
            if p is None:
                continue
            j = _journal(pid)
            if sync(p, sch, j):
                save(p)
            out.append(summary(p, sch, j))
    order = _ids(sch["statuses"])
    out.sort(key=lambda s: (order.index(s["status"]), s["order"], s["label"].lower()))
    return {"projects": out, "schema": sch}


def get(pid):
    sch = schema()
    with LOCK:
        p = load(pid, sch)
        if p is None:
            return None
        j = _journal(pid)
        if sync(p, sch, j):
            save(p)
        return full(p, sch, j)


# ---------- validated edits ----------
def _str(v, n=500, empty=True):
    if not isinstance(v, str) or len(v) > n or (not empty and not v.strip()):
        raise Invalid("invalid text")
    return v.strip()


def _clean_task_fields(f, sch):
    if not isinstance(f, dict):
        raise Invalid("invalid fields")
    out = {}
    if "title" in f:
        out["title"] = _str(f["title"], 300, empty=False)
    if "col" in f:
        if f["col"] not in _ids(sch["columns"]):
            raise Invalid("unknown column")
        out["col"] = f["col"]
    if "importance" in f:
        if f["importance"] not in _ids(sch["importance"]):
            raise Invalid("unknown importance")
        out["importance"] = f["importance"]
    if "due" in f:
        if f["due"] and not (isinstance(f["due"], str) and DATE_RE.match(f["due"])):
            raise Invalid("invalid date")
        out["due"] = f["due"] or ""
    if "tags" in f:
        if not isinstance(f["tags"], list) or len(f["tags"]) > 8:
            raise Invalid("invalid tags")
        out["tags"] = [t for t in (re.sub(r"[^\w\- ]", "", _str(t, 30)).strip() for t in f["tags"] if isinstance(t, str)) if t]
    if "notes" in f:
        out["notes"] = _str(f["notes"], 4000)
    return out


def _task(p, tid):
    t = next((t for t in p["tasks"] if t["id"] == tid), None)
    if not t:
        raise Invalid("task not found")
    return t


def normalize_link(url):
    """Accepts "site.com/page", "https://…", "localhost:3000", "/absolute/path" or "~/path"; returns a usable address."""
    url = url.strip()
    if url.startswith("~/"):
        url = os.path.expanduser(url)
    if re.match(r"^https?://\S+$", url, re.I) or url.startswith("/"):
        return url
    if re.match(r"^(localhost|127\.0\.0\.1)(:\d+)?(/\S*)?$", url, re.I):  # local development server
        return "http://" + url
    if re.match(r"^[\w-]+(\.[\w-]+)+(:\d+)?(/\S*)?$", url):  # domain name without a scheme
        return "https://" + url
    raise Invalid("invalid link: a web address (site.com/page) or a file path (/… or ~/…)")


def _mark_done(t, col, sch):
    if col == sch["done_column"] and t.get("col") != col:
        t["done_at"] = _now()


def apply(pid, op, a):
    """Apply one operation and return the full, updated project."""
    sch = schema()
    if not isinstance(a, dict):
        raise Invalid("invalid arguments")
    with LOCK:
        p = load(pid, sch)
        if p is None:
            raise Invalid("project not found")
        if op == "set":
            if "status" in a:
                if a["status"] not in _ids(sch["statuses"]):
                    raise Invalid("unknown status")
                p["status"] = a["status"]
            for k, n in (("label", 60), ("objective", 600), ("next_time", 600), ("for_whom", 300), ("problem", 600), ("notes", 8000)):
                if k in a:
                    p[k] = _str(a[k], n, empty=(k != "label"))
                    if k == "next_time":
                        p["next_time_at"] = datetime.now().strftime("%Y-%m-%d %H:%M")
            if "order" in a:
                p["order"] = int(a["order"])
            if "links" in a:
                if not isinstance(a["links"], list) or len(a["links"]) > 20:
                    raise Invalid("invalid links")
                links = []
                for ln in a["links"]:
                    if not isinstance(ln, dict):
                        raise Invalid("invalid links")
                    url = normalize_link(_str(ln.get("url", ""), 500, empty=False))
                    links.append({"label": _str(ln.get("label", ""), 60) or url, "url": url})
                p["links"] = links
        elif op == "task_add":
            f = _clean_task_fields({"col": sch["new_column"], "importance": sch["default_importance"], **a}, sch)
            if "title" not in f:
                raise Invalid("missing title")
            t = {"id": _new_id("t"), "title": f["title"], "col": f["col"], "importance": f["importance"], "due": f.get("due", ""),
                 "tags": f.get("tags", []), "notes": f.get("notes", ""), "source": "dashboard", "created": _now()}
            if t["col"] == sch["done_column"]:
                t["done_at"] = _now()
            idx = [i for i, x in enumerate(p["tasks"]) if x["col"] == t["col"]]
            p["tasks"].insert(idx[0] if idx else len(p["tasks"]), t)  # top of its column
        elif op == "task_update":
            t = _task(p, a.get("tid"))
            f = _clean_task_fields(a.get("fields", {}), sch)
            if "col" in f:
                _mark_done(t, f["col"], sch)
            t.update(f)
        elif op == "task_move":
            t = _task(p, a.get("tid"))
            col = a.get("col")
            if col not in _ids(sch["columns"]):
                raise Invalid("unknown column")
            _mark_done(t, col, sch)
            t["col"] = col
            p["tasks"].remove(t)
            same = [i for i, x in enumerate(p["tasks"]) if x["col"] == col]
            pos = max(0, min(int(a.get("index", len(same))), len(same)))
            insert_at = same[pos] if pos < len(same) else (same[-1] + 1 if same else len(p["tasks"]))
            p["tasks"].insert(insert_at, t)
        elif op == "task_delete":
            p["tasks"].remove(_task(p, a.get("tid")))
        elif op == "idea_add":
            p["ideas"].insert(0, {"id": _new_id("i"), "text": _str(a.get("text"), 500, empty=False), "source": "dashboard",
                                  "created": _now(), "task": ""})
        elif op == "idea_promote":
            i = next((i for i in p["ideas"] if i["id"] == a.get("iid")), None)
            if not i:
                raise Invalid("idea not found")
            if not i.get("task"):
                t = {"id": _new_id("t"), "title": i["text"][:300], "col": sch["inbox_column"], "importance": sch["default_importance"],
                     "due": "", "tags": [], "notes": "", "source": "idea", "created": _now()}
                idx = [k for k, x in enumerate(p["tasks"]) if x["col"] == t["col"]]
                p["tasks"].insert(idx[0] if idx else len(p["tasks"]), t)
                i["task"] = t["id"]
        elif op == "idea_delete":
            i = next((i for i in p["ideas"] if i["id"] == a.get("iid")), None)
            if not i:
                raise Invalid("idea not found")
            p["ideas"].remove(i)
        else:
            raise Invalid("unknown operation")
        save(p)
        return full(p, sch)


def create(label, status=None, objective=""):
    sch = schema()
    label = _str(label, 60, empty=False)
    status = status or sch["idea_status"]
    if status not in _ids(sch["statuses"]):
        raise Invalid("unknown status")
    base = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode().lower()).strip("-")[:26] or "project"
    if not ID_RE.match(base):
        raise Invalid("invalid project name")
    with LOCK:
        pid, n = base, 2
        while os.path.exists(path(pid)):  # same name as an existing project: -2, -3…
            pid, n = f"{base}-{n}", n + 1
        save({"id": pid, "label": label, "status": status, "objective": _str(objective, 600), "created": _now(),
              "tasks": [], "ideas": [], "links": [], "imported": {"tasks": [], "ideas": []}})
    return get(pid)


def delete(pid):
    """Delete a project: the file is moved to state/projects-deleted/ (recoverable), never erased."""
    with LOCK:
        if not ID_RE.match(pid or "") or not os.path.exists(path(pid)):
            raise Invalid("project not found")
        os.makedirs(DELETED, exist_ok=True)
        os.replace(path(pid), os.path.join(DELETED, f"{pid}-{datetime.now():%Y%m%d-%H%M%S}.json"))


if __name__ == "__main__":  # quick check: python3 dashboard/projects.py
    for s in list_all()["projects"]:
        print(f"{s['label']:<20} {s['status']:<10} {s['done']}/{s['total']} tasks · {s['ideas']} ideas · "
              f"milestone {(s['milestone'] or {}).get('label', '–')}")
