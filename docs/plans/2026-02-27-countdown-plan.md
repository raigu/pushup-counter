# Countdown Timer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a live countdown on the landing page when the challenge hasn't started yet, ticking every second.

**Architecture:** Modify `fetchChallenge()` in `odometer.js` to compare current time against the challenge start date. If the challenge hasn't started, render a countdown ("Starts in Xd Xh Xm Xs") inside `#challenge-dates` alongside the date range, ticking via `setInterval(1000)`. When it reaches zero, replace with "Challenge started!". No backend changes.

**Tech Stack:** Vanilla JS, existing `/api/challenge` endpoint

---

### Task 1: Add countdown logic to odometer.js

**Files:**
- Modify: `public/js/odometer.js:55-66` (the `fetchChallenge()` function)
- Modify: `public/index.html:10` (add a countdown element)
- Modify: `public/css/odometer.css` (style the countdown)

**Step 1: Add countdown element to HTML**

In `public/index.html`, add a countdown div after the challenge-dates div (line 10):

```html
<div id="challenge-dates" class="challenge-dates"></div>
<div id="countdown" class="countdown"></div>
<div class="board" id="board"></div>
```

**Step 2: Add countdown CSS**

In `public/css/odometer.css`, add:

```css
.countdown {
  color: #aaa;
  font-size: 1.2rem;
  margin-bottom: 16px;
  text-align: center;
}
```

**Step 3: Replace fetchChallenge() with countdown-aware version**

Replace the `fetchChallenge()` function and the call to it at the bottom of `public/js/odometer.js` with:

```javascript
let countdownInterval = null;

async function fetchChallenge() {
  try {
    const res = await fetch('/api/challenge');
    const data = await res.json();
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const start = new Date(data.start + 'T00:00:00');
    const end = new Date(data.end + 'T00:00:00');
    document.getElementById('challenge-dates').textContent =
      start.toLocaleDateString(undefined, opts) + ' – ' + end.toLocaleDateString(undefined, opts);

    startCountdown(start);
  } catch (e) {
    // silently ignore
  }
}

function startCountdown(startDate) {
  const el = document.getElementById('countdown');
  if (countdownInterval) clearInterval(countdownInterval);

  function tick() {
    const now = new Date();
    const diff = startDate - now;
    if (diff <= 0) {
      el.textContent = 'Challenge started!';
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    el.textContent = 'Starts in ' + days + 'd ' + hours + 'h ' + minutes + 'm ' + seconds + 's';
  }

  // Only show countdown if challenge is in the future
  if (startDate > new Date()) {
    tick();
    countdownInterval = setInterval(tick, 1000);
  }
}
```

**Step 4: Verify the initial load and interval calls remain**

The bottom of `odometer.js` should still have:

```javascript
// Initial load
fetchTotals();
fetchChallenge();

// Refresh every 30 seconds
setInterval(fetchTotals, 30000);
```

No changes needed here — `fetchChallenge()` is already called.

**Step 5: Manual test**

To test with a future challenge date:

```bash
docker exec pushups node cli.js set-challenge 2026-03-01 2026-04-01
```

Open the landing page — should see countdown ticking. Then:

```bash
docker exec pushups node cli.js set-challenge 2026-02-27 2026-04-01
```

Refresh — countdown should not appear (challenge already started today).

**Step 6: Commit**

```bash
git add public/js/odometer.js public/index.html public/css/odometer.css
git commit -m "Add countdown timer for upcoming challenges"
```
