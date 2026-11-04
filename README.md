# Brief Town

A 16-bit town that turns your daily admin brief into somewhere you can walk around.

- **Slack, Gmail and Calendar houses.** Walk through a door and the keeper reads out that app's items, urgent ones first.
- **Notice board.** Holds the day's headline and "Shape of the day".
- **Byte the dog.** His mood shows how urgent the day is: napping, alert, pacing or zoomies. Talk to him for a combined urgency meter across every house.

It's one static `index.html` with no build step and no dependencies. Your data never leaves your computer.

**Controls:** Arrow keys / WASD to walk · Space / Z to talk · X / Esc to close · on-screen pad on phones

## Quick start with Claude Code

```bash
git clone <this repo> brief-town
cd brief-town
claude
```

Then tell Claude: **"set up Brief Town"**. `CLAUDE.md` tells it what to do:

1. Start a local server and give you the `http://localhost:8000` link.
2. Check which Slack, Gmail and Google Calendar connections you have in Claude Code.
3. Run `/brief` to read them (read-only) and write today's brief to `brief.local.txt`.

The page reads `brief.local.txt` and checks it again every minute. Run `/brief` whenever you want a fresh one and the town updates itself.

## Quick start without Claude Code

```bash
python3 -m http.server 8000      # or: npx serve -l 8000
```

Open <http://localhost:8000>. The town starts with made-up sample data. To use your own, either:

- write a brief to `brief.local.txt` in this folder (format below), or
- click **Mailbag** and paste a brief in (it's kept in your browser's local storage).

## Brief format

Plain text, the same shape as a Slack DM. Section headings on their own line, then numbered or `•` items. `*bold*` markers and `(3)` counts on headings are fine.

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

Recognised sections: `Shape of the day`, `Needs you today`*, `Prep for tomorrow`, `Worth a glance`, `Still waiting on you`*, `You're waiting on them`, `Tomorrow starts with`. The two marked * count as **urgent**.

**Which house an item goes to**, in order:

1. A link in the item: `slack.com` goes to Slack, `mail.google.com` to Gmail, `calendar.google.com` to Calendar. Slack-style `<url|label>` and Markdown `[label](url)` links both work.
2. A tag: `[slack]`, `[email]`, `[event]`. A bare `[thread]` goes to Gmail if the item mentions email, otherwise Slack.
3. "Prep for tomorrow" and "Tomorrow starts with" default to Calendar.
4. Anything else goes on the notice board.

See `sample-brief.txt` for a full example with a morning brief and an end-of-day sweep.

## Privacy

- `brief.local.txt` is in `.gitignore`. **Never commit it**: it holds your real messages.
- The repo contains no keys or tokens. Connections to Slack, Gmail and Calendar live in your own Claude Code setup, not here.
- The page makes no network requests except Google Fonts and its own `brief.local.txt`.
