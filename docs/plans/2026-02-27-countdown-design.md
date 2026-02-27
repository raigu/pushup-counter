# Countdown Timer Design

**Goal:** Show a live countdown on the landing page when the challenge hasn't started yet.

## Behavior

- `fetchChallenge()` already fetches start/end from `/api/challenge`
- If `now < start`: show countdown "Starts in 5d 3h 12m 45s" ticking every second, date range still visible
- When countdown hits zero: replace countdown with "Challenge started!"
- If `now >= start`: no countdown, just the date range
- If `now > end`: just show dates, nothing special
- Scoreboard always visible (shows zeros before challenge starts)

## Implementation

- All client-side in `odometer.js`
- Compare current time to challenge start date
- `setInterval(1000)` to tick the countdown
- No backend changes needed
