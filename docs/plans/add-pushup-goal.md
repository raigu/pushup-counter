# Add Optional Global Pushup Goal

## Overview

Add an optional challenge-wide pushup goal. When set, the scoreboard shows
progress toward the goal. When not set, nothing changes.

## Storage

Use the existing `settings` table. New key:

- `challenge_goal` — nullable TEXT (stored as string, parsed as integer).
  `NULL` or absent = no goal.

No new migration needed — the `settings` table already exists (migration 3).
The goal is seeded as `NULL` on first read if the key doesn't exist.

## CLI (`cli.js`)

Two new commands:

```
node cli.js set-goal <number>    # e.g. node cli.js set-goal 5000
node cli.js clear-goal           # removes the goal
node cli.js show-challenge       # updated to also print the goal if set
```

Validation: goal must be a positive integer.

## API changes (`app.js`)

### `GET /api/challenge`

Add `goal` field to the response:

```json
{
  "challenge_start": "2026-02-26",
  "challenge_end": "2026-03-26",
  "goal": 5000          // null if not set
}
```

### `GET /api/challenge/totals`

No changes — it already returns per-user totals. The frontend will sum them
and compare to the goal from `/api/challenge`.

## Frontend — Public Scoreboard (`public/index.html`)

When `goal` is present in `/api/challenge` response:

- Show a progress bar below the challenge dates header
- Display "Total: X / Y" (sum of all users vs goal)
- Progress bar fills proportionally; turns green at 100%

When `goal` is `null`: no progress bar, no change from current UI.

## Frontend — Admin Page (`public/admin.html`)

When `goal` is present:

- Show the team goal and current team total below user's personal stats
- e.g. "Team goal: 420 / 5000"

When `goal` is `null`: no change.

## Tests (`test/app.test.js`)

- `GET /api/challenge` returns `goal: null` by default
- After setting goal via DB, `GET /api/challenge` returns `goal: 5000`
- Goal does not affect pushup submission or totals logic
