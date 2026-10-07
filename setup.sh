#!/usr/bin/env bash
# First-time bootstrap: checks prerequisites and creates the private folders. Changes nothing outside this folder.
set -u
cd "$(dirname "$0")"
ok=1
say() { printf '%s\n' "$*"; }

say "Agentic OS Kit — checking your computer"
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'; then
  say "  ✓ Python $(python3 -c 'import platform; print(platform.python_version())')"
else
  say "  ✗ Python 3.10+ is missing (Mac: xcode-select --install · Linux: install python3)"; ok=0
fi
if command -v claude >/dev/null 2>&1; then say "  ✓ Claude Code $(claude --version 2>/dev/null | head -1)"
else say "  ✗ Claude Code is missing — https://docs.claude.com/en/docs/claude-code/setup"; ok=0; fi
if command -v git >/dev/null 2>&1; then say "  ✓ Git"; else say "  • Git not found (optional, used for backups)"; fi
case "$(uname -s)" in
  Darwin) say "  ✓ macOS" ;;
  Linux)  say "  ✓ Linux" ;;
  *)      say "  • Unknown system: the scheduler step will be manual" ;;
esac

mkdir -p state dashboard/data routines/queue routines/prompts/custom interviews memory-map/areas .claude/skills
[ -f os.config.json ] || { cp os.config.example.json os.config.json && say "  ✓ Created os.config.json (your private settings)"; }
if command -v git >/dev/null 2>&1 && [ -d .git ]; then git config core.hooksPath .githooks && say "  ✓ Secret-blocking git hook enabled"; fi

if [ "$ok" = 1 ]; then
  say ""; say "Ready. Now run:  claude"; say "and say: hi, let's set up my OS"
else
  say ""; say "Fix the ✗ items above, then run: bash setup.sh"; exit 1
fi
