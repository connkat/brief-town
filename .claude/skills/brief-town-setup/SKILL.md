---
name: brief-town-setup
description: Set up Brief Town for a new user after cloning — check prerequisites, get Slack, Gmail and Google Calendar connected, write brief.config.json with read-only tools, run a test brief and start the server. Use when the user says "set up Brief Town", is opening this repo for the first time, or brief.config.json is missing.
---

# Set up Brief Town

Walk the user through these steps in order. Say briefly what each step is for. Don't skip ahead while a step is blocked on them.

## 1. Prerequisites

Assume the user may not be technical. Use plain language, don't show raw terminal output unless something fails, and ask before installing anything.

**Claude Code** is already working, since they're talking to you.

**Node.js 18 or newer** runs the little server behind the town. Check with `node --version`.

If Node is missing or older than 18:

1. Explain in one sentence: "Brief Town needs a free program called Node.js to run. I can install it for you; it takes a couple of minutes." Ask whether you should go ahead. If they say no, tell them they can install the LTS version from https://nodejs.org themselves and say "set up Brief Town" again afterwards, then stop.
2. If they say yes, install the current LTS version for their system. Prefer methods that don't need an admin password:
   - **macOS with Homebrew** (`brew --version` works): `brew install node`.
   - **macOS or Linux without Homebrew:** install nvm into their home folder, then Node, in one command:
     `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm install --lts`
   - **Windows:** `winget install OpenJS.NodeJS.LTS`. If winget isn't available, send them to https://nodejs.org to download the LTS installer and wait for them.
   - If anything asks for a password or fails, stop and explain in plain words. Don't try other approaches without asking.
3. Confirm with `node --version`. A new install may not be on the PATH in this session yet: with nvm, prefix later commands with `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" &&`. Otherwise ask them to quit and reopen Claude Code in this folder, then say "set up Brief Town" to continue.
4. If you set up start-at-login later (step 5), use the full path from `command -v node`, since login items don't load their shell settings.

## 2. Connect Slack, Gmail and Google Calendar

Look at the MCP tools available in this session and work out which of the three services are connected. Tools usually look like `mcp__<server>__<tool>`; connectors added on claude.ai show up as `mcp__claude_ai_<Name>__<tool>`.

For each missing service:

- Tell the user which one is missing and how to connect it. Either:
  - **claude.ai connectors:** Settings → Connectors on claude.ai, connect Slack / Gmail / Google Calendar, then restart Claude Code here (they appear automatically when Claude Code is signed in with the same account), or
  - **`/mcp`** in Claude Code to see servers and sign in, or `claude mcp add` for a server their team uses.
- They sign in themselves. **Never ask for, accept or store API keys, tokens or passwords**, and never write credentials into this repo.
- Wait for them to say it's done, then check the tool list again. If tools still don't appear, ask them to restart Claude Code in this folder and say "set up Brief Town" again.

It's fine to continue with only some services connected; the brief notes what it couldn't read. Confirm that with the user first.

## 3. Write `brief.config.json`

Copy `brief.config.example.json` to `brief.config.json` (gitignored) and fill in:

- **`allowedTools`**: the exact names of the **read-only** tools you can see for those services — tools that search, list, get or read messages, threads, channels, profiles and events.
  - **Never** include a tool that sends, posts, replies, reacts, drafts, schedules, creates, updates, deletes, archives, labels, trashes, RSVPs, forwards, shares or uploads. If unsure whether a tool only reads, leave it out.
  - Show the user the full list and **get an explicit yes before saving**. This list is everything the unattended runs are allowed to do.
- **`blockedTools`**: every *other* tool those same services offer, i.e. everything you left out of `allowedTools` (send, post, draft, create, update, delete and so on). These are passed as deny rules, which beat any "always allow" the user may have set in their own Claude Code settings. Don't skip this even if the list is long.
- Then run `npm run check`. The server refuses to run if any allowed tool looks like it can change something, or isn't an exact MCP tool name. If it complains, take that tool out; don't try to get around the check.
- **`schedule`**: ask whether the defaults work — morning brief 07:50 and end-of-day sweep 16:25, weekdays, computer's local time. Adjust if not.
- Remove the `_comment` key.

## 4. Test

Run `npm run brief`. It runs one brief in the foreground (morning before noon, sweep after) and prints it. Show the user the result.

If it fails, read the error. Usually it's a tool name that isn't in `allowedTools`, or a service that needs signing in again. Fix and re-run.

## 5. Start

Run `npm start` in the background and give them http://localhost:8000. Tell them:

- Briefs refresh on schedule while the server runs. Talking to Wren the bird or pressing **Fetch new brief** gets one on demand.
- They can also say "brief me" in Claude Code in this folder for a brief in chat.
- The server has to be running for scheduled briefs. Offer to make it start at login (launchd on macOS, a systemd user service on Linux, Task Scheduler on Windows). Only set it up if they say yes.

## Rules

- Read-only: never widen `allowedTools` with write tools; never remove `ALWAYS_DENIED` in `server.mjs`.
- Never commit `brief.config.json` or `brief.local.txt`.
