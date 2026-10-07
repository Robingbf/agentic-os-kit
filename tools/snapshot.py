#!/usr/bin/env python3
"""Nightly git snapshot of the OS folder: commit when something changed, after a blocking secret scan.

Run every night by the runner (routine git-snapshot) and used by the pre-commit hook (--check).
Pushes only when a remote named "origin" exists (you add it yourself); it never creates a remote repository.
Personal files stay out of git through .gitignore.
"""
import os
import re
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Secret patterns: known API key formats, private keys, JWTs, explicit password or token assignments
SECRETS = [
    r"sk-ant-[A-Za-z0-9_-]{20,}", r"\b[sr]k_(live|test)_[A-Za-z0-9]{16,}", r"\bgh[pousr]_[A-Za-z0-9]{30,}",
    r"github_pat_[A-Za-z0-9_]{30,}", r"\bAKIA[0-9A-Z]{16}\b", r"\bAIza[0-9A-Za-z_-]{35}\b", r"\bxox[abprs]-[A-Za-z0-9-]{10,}",
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}",
    r"(?i)\b[a-z][a-z0-9+.-]*://[^\s:/@\"']+:[^\s@/\"']{6,}@",
    r"(?i)\b(password|passwd|secret|api_key|apikey|access_key|client_secret|token)\s*[:=]\s*[\"'][^\"'\s]{8,}[\"']",
]


def git(*args):
    return subprocess.run(["git", "-C", ROOT, *args], capture_output=True, text=True)


def leaks():
    """Lines added to the index that look like a secret: [(file, pattern)]."""
    diff = git("diff", "--cached", "-U0", "--no-color").stdout
    found, current = [], None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("+") and current:
            for pat in SECRETS:
                if re.search(pat, line):
                    found.append((current, pat))
    return found


def check():
    bad = leaks()
    for f, pat in bad:
        print(f"possible secret in {f} (pattern {pat})", file=sys.stderr)
    if bad:
        print("commit blocked: remove the secret, or add the file to .gitignore", file=sys.stderr)
    return 1 if bad else 0


def push():
    """Push the commits that are not on the remote yet (only if a remote named origin exists)."""
    if git("remote", "get-url", "origin").returncode != 0:
        return 0  # no remote: local snapshots only
    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if not branch or branch == "HEAD":
        return 0
    git("fetch", "-q", "origin")
    if git("rev-parse", "--verify", "-q", f"origin/{branch}").returncode == 0:
        ahead = git("rev-list", "--count", f"origin/{branch}..{branch}").stdout.strip()
        if ahead == "0":
            print("remote already up to date")
            return 0
        p = git("push", "-q", "origin", branch)
    else:
        ahead = "?"
        p = git("push", "-q", "-u", "origin", branch)
    print(f"pushed to origin ({ahead} commit(s))" if p.returncode == 0 else "push failed: " + p.stderr.strip()[:300])
    return p.returncode


def snapshot():
    top = git("rev-parse", "--show-toplevel").stdout.strip()
    if not top or os.path.realpath(top) != os.path.realpath(ROOT):  # never commit a parent repository
        print("the OS folder is not a git repository: run `git init` in it to enable nightly snapshots")
        return 0
    git("add", "-A")
    if not git("diff", "--cached", "--quiet").returncode:
        print("no changes")
        return push()
    if check():
        git("reset", "-q")
        return 1
    files = git("diff", "--cached", "--name-only").stdout.split()
    msg = f"Snapshot {datetime.now():%Y-%m-%d %H:%M} ({len(files)} file{'s' if len(files) > 1 else ''})"
    p = git("commit", "-q", "-m", msg)
    print(msg if p.returncode == 0 else p.stderr.strip())
    return p.returncode or push()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else snapshot())
