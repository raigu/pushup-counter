# Progress Bar Color by Pace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Color progress bars green/yellow/red based on comparison to rabbit pace.

**Architecture:** Backend adds `_rabbitPace` to `/api/challenge/totals` response. Frontend applies CSS class based on user total vs pace.

**Tech Stack:** Node.js, vanilla JS, CSS

---

### Task 1: Backend — add `_rabbitPace` to totals response

**Files:**
- Modify: `app.js:37-61` (the `/api/challenge/totals` handler)
- Test: `test/app.test.js`

**Step 1: Write failing test — `_rabbitPace` returned when goal is set**

Add inside `describe('GET /api/challenge/totals')` block in `test/app.test.js`:

```javascript
it('returns _rabbitPace when goal is set', async () => {
  const now = new Date();
  const pastStart = new Date(now.getTime() - 15 * 86400000).toISOString().slice(0, 10);
  const futureEnd = new Date(now.getTime() + 15 * 86400000).toISOString().slice(0, 10);
  const origStart = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
  const origEnd = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(pastStart);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(futureEnd);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_goal', '3000')").run();

  const res = await request(server, 'GET', '/api/challenge/totals');
  assert.equal(res.status, 200);
  assert.ok(typeof res.body._rabbitPace === 'number');
  assert.ok(res.body._rabbitPace > 0, '_rabbitPace should be > 0 midway');
  assert.ok(res.body._rabbitPace < 3000, '_rabbitPace should be < goal');

  db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(origStart);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(origEnd);
  db.prepare("DELETE FROM settings WHERE key = 'challenge_goal'").run();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `_rabbitPace` is undefined

**Step 3: Write failing test — `_rabbitPace` omitted when no goal**

```javascript
it('does not return _rabbitPace when no goal is set', async () => {
  db.prepare("DELETE FROM settings WHERE key = 'challenge_goal'").run();
  const res = await request(server, 'GET', '/api/challenge/totals');
  assert.equal(res.status, 200);
  assert.equal(res.body._rabbitPace, undefined);
});
```

**Step 4: Implement — add `_rabbitPace` to response in `app.js`**

In the `GET /api/challenge/totals` handler, after building `totals`, before `res.json(totals)`:

```javascript
if (challengeGoal > 0) {
  totals._rabbitPace = getRabbitTotal(challengeGoal, start, end);
}
```

**Step 5: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: all PASS

**Step 6: Commit**

Commit message: `Add rabbit pace to totals API response`

---

### Task 2: Frontend CSS — add color classes

**Files:**
- Modify: `public/css/odometer.css:170-180`

**Step 1: Replace `.goal-fill` and `.goal-fill.reached` styles**

Replace the existing `.goal-fill` background and `.goal-fill.reached` rule with:

```css
.goal-fill {
  height: 100%;
  width: 0%;
  border-radius: 3px;
  transition: width 0.8s ease;
}

.goal-fill--ahead {
  background: #2ecc71;
}

.goal-fill--on-track {
  background: #f1c40f;
}

.goal-fill--behind {
  background: #e94560;
}
```

**Step 2: Commit**

Commit message: `Add pace-based color classes for progress bar`

---

### Task 3: Frontend JS — apply color based on pace

**Files:**
- Modify: `public/js/odometer.js:59-74` (the `fetchTotals` function)

**Step 1: Update `fetchTotals` to read `_rabbitPace` and set CSS class**

In `fetchTotals`, after `const data = await res.json()`, extract rabbitPace:

```javascript
const rabbitPace = data._rabbitPace;
delete data._rabbitPace;
```

Then in the loop where goal-fill is updated, replace the `fill.classList.toggle('reached', ...)` line with:

```javascript
fill.className = 'goal-fill';
if (rabbitPace !== undefined) {
  if (total > rabbitPace) fill.classList.add('goal-fill--ahead');
  else if (total === rabbitPace) fill.classList.add('goal-fill--on-track');
  else fill.classList.add('goal-fill--behind');
}
```

**Step 2: Verify in browser**

Open `http://localhost:3000`. Progress bars should be colored:
- Red if behind pace
- Yellow if exactly matching pace
- Green if ahead of pace

**Step 3: Commit**

Commit message: `Color progress bar based on rabbit pace comparison`
