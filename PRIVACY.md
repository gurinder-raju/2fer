# 2fer privacy

2fer is a plugin that runs inside Claude Code on your machine. It has no server, no account and no analytics, and nothing it reads or keeps reaches its author.

## What it reads

2fer reads the messages you send to Claude Code, to decide which ones you dictated and to score those. It doesn't read your files, your conversation history or Claude's replies.

## What it sends

For each message that passes its checks, 2fer makes one request to the model you chose, through Claude Code and on the same account as your session. So it goes to the same provider as the rest of your conversation, under that provider's terms. The request holds only that message, with pastes and links cut out. It holds no conversation history and no tools.

When you pick a habit in the weekly view, 2fer may make one more request of the same kind. It holds the model's notes on that habit from the past week, which can quote you.

With **No model** chosen, 2fer sends nothing.

## What it keeps, and for how long

Everything is kept on your machine, in a JSON file under your Claude Code configuration folder. It isn't encrypted.

| What | Kept for |
|---|---|
| Notes and the session pane's copy of your messages | the session |
| Scores, counts of 2fer's fixed habit words, where those words fell, and token use | 26 weeks |
| The start of a message (up to 200 characters), a few words around each habit, and the model's notes, 2fers and weekly patterns, which can quote you | 7 days |
| Your settings | until you change them |

Records older than these limits are deleted the next time a session starts.

## How to delete it

- **One message:** **Ignore** on its card removes its note, its scores and its words. Its token use stays in the week's total.
- **Everything:** `/2fer forget` deletes all scores, counts and kept words, apart from your settings. Notes in other open sessions stay until those sessions end.
- **Stopping it:** `/2fer pause` stops new notes in every session until `/2fer resume`.

## Who it's for

2fer isn't meant for people under 18.

## Questions

Open an issue at https://github.com/gurinder-raju/2fer/issues.
