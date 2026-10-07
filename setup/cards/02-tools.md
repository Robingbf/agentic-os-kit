# Card 02 — Tools, files and connectors

**Goal:** know where their information lives and what Claude can already reach.

## Steps

1. **Inventory**, one category at a time (skip what does not apply): email; calendar; tasks / boards
   (Notion, Trello, Todoist, Asana, Linear…); notes (Apple Notes, Obsidian, Google Docs…); files (local
   folders, iCloud, Google Drive, Dropbox, OneDrive); messaging (Slack, WhatsApp, Discord…); money
   (Stripe, bank, invoicing tool, accounting); stats (analytics, YouTube Studio, social platforms, store
   consoles); code (GitHub, hosting); anything specific to their job. For each: "how often do you open
   it, and what do you look for?"
2. **What is connected.** Check what Claude Code can reach, read-only:
   - run `claude mcp list` (local connectors);
   - ask whether they connected apps on claude.ai (Settings → Connectors): Gmail, Google Calendar,
     Google Drive, Notion, Slack, etc. Those appear in Claude Code too when they are logged in with the
     same account. If unsure, list the tools you can see in this session whose names start with `mcp__`.
3. **Gaps.** For each important tool with no connector, propose the simplest safe option and let them
   choose: an official connector to add (they add it themselves on claude.ai or with `claude mcp add`),
   a regular export file in a folder, an API key **they** create and store in a local `.env` (never in
   git, never pasted in chat logs), or "not needed". Never install third-party servers without their
   explicit yes, and prefer official ones.
4. **Write** `interviews/<today>-tools.md`: a table Tool | Used for | How often | Reachable by Claude
   (yes / after connecting / no) | Decision.

## Done when
The table exists and the user agrees with the decisions. Next: card 03 (memory map).
