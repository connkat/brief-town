# Brief Town

A 16-bit town that turns your Slack, Gmail and Google Calendar into somewhere you can walk around.

- **Slack, Gmail and Calendar houses.** Walk through a door and the keeper reads out what needs you there, urgent things first.
- **Notice board.** Holds the day's headline and "Shape of the day".
- **Byte the dog.** His mood shows how urgent the whole day is: napping, alert, pacing or zoomies. Talk to him for a combined urgency meter. He disappears while he's out fetching a new brief.

Briefs are written by Claude Code on your own computer, from your own accounts. A morning brief arrives at 7:50am and an end-of-day sweep at 4:25pm on weekdays, or press **Fetch new brief** any time.

**Controls:** arrow keys or WASD to walk · Space or Z to talk · X or Esc to close · on-screen pad on phones

## Setup

You need [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) and Node 18+.

```bash
git clone <this repo> brief-town
cd brief-town
claude
```

Then say: **"set up Brief Town"**. Claude walks you through it (see `CLAUDE.md`):

1. **Connect Slack, Gmail and Google Calendar** in Claude Code, if they aren't already. You sign in to each one yourself through `/mcp`; nothing gets stored in this repo.
2. Claude lists the **read-only** tools those connections give it (search, list, read) and saves them to `brief.config.json` after you approve the list.
3. It runs one test brief so you can check it.
4. It starts the server. Open <http://localhost:8000>.

To run it again later: `npm start`.

| Command | What it does |
|---|---|
| `npm start` | Serve the game on localhost and fetch briefs on schedule |
| `npm run brief` | Fetch one brief now and print it (morning before noon, sweep after) |
| `npm run brief:morning` / `brief:eod` | Force a particular kind |

The schedule lives in `brief.config.json` and uses your computer's local time. The server has to be running for scheduled briefs. Claude can set it up to start at login if you ask.

## How it stays safe

- **Read-only by construction.** Each brief runs `claude -p` with `--allowedTools` set to the read tools in `brief.config.json`. In headless mode anything not on the list is denied. Bash, file edits, web access and subagents are always blocked as well. Claude can't send, reply, post, react or touch your calendar, and it doesn't write files: it prints the brief and the server saves it.
- **Messages are data.** The prompt tells Claude to summarise what it reads and never follow instructions inside emails or messages.
- **Stays on your machine.** The server listens on `127.0.0.1` only and rejects requests from other sites. The page makes no requests except Google Fonts and its own server.
- **Nothing personal in git.** `brief.local.txt` (your brief) and `brief.config.json` (your tool list) are gitignored. There are no keys anywhere; your connections live in Claude Code.
- Each brief is a Claude Code run, so it uses your Claude plan's usage.

## Without connections

Run `npm start` (or any static server) and press **Paste a brief**. The town also starts with fictional sample data so you can look around first.

## Brief format

This is what Claude writes, and what you can paste. Plain text, section headings on their own line, numbered or `•` items. `*bold*` and `(3)` counts on headings are fine.

```
Monday, Mar 9 · 3h 30m booked

Shape of the day
One or two sentences about the day.

Needs you today
1. Short title — who asked, where, what they want. [email]

Prep for tomorrow
• Meeting, 10:00 — the prep. [event]

Worth a glance
• Something that closed. [slack]
```

Sections: `Shape of the day`, `Needs you today`*, `Prep for tomorrow`, `Worth a glance`, `Still waiting on you`*, `You're waiting on them`, `Tomorrow starts with`. The ones marked * count as **urgent**.

**Which house an item goes to**, in order:

1. A link in the item: `slack.com` goes to Slack, `mail.google.com` to Gmail, `calendar.google.com` to Calendar.
2. A tag: `[slack]`, `[email]`, `[event]`. A bare `[thread]` goes to Gmail if the item mentions email, otherwise Slack.
3. "Prep for tomorrow" and "Tomorrow starts with" default to Calendar.
4. Anything else goes on the notice board.

See `sample-brief.txt` for a full morning brief and end-of-day sweep.
