# Progress Bar Color Based on Rabbit Pace

## Problem

Progress bar is always red regardless of whether user is on track. No visual feedback on pacing.

## Design

### Approach: Compute rabbit pace on backend, color on frontend

### API Change

`GET /api/challenge/totals` adds `_rabbitPace` field:

```json
{ "Eduard": 21, "Test": 12, "_rabbitPace": 25 }
```

- `_rabbitPace` = `Math.floor(goal * elapsed / total_duration)` — same formula as `getRabbitTotal`
- Returned even when no rabbit user is configured
- Omitted when no goal is set

### Frontend Logic

Compare each user's total to `rabbitPace`:
- `total > rabbitPace` → green (`#2ecc71`) — CSS class `goal-fill--ahead`
- `total === rabbitPace` → yellow (`#f1c40f`) — CSS class `goal-fill--on-track`
- `total < rabbitPace` → red (`#e94560`) — CSS class `goal-fill--behind`

Replaces existing `.goal-fill.reached` class.

### Edge Cases

- No goal set: no bar shown (unchanged)
- No rabbit configured: `_rabbitPace` still returned, bar still colored
- Rabbit users: colored by same logic
- Exact match only counts as "on track" (yellow)
