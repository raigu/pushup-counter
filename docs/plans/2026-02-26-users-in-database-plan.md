# Users in Database Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move user config from hardcoded env vars to a `users` SQLite table, managed via CLI.

**Architecture:** Add `users` table, extract shared DB module, replace all hardcoded lookups with DB queries, make public page dynamic.

**Tech Stack:** Node.js, Express, better-sqlite3, vanilla JS

---

### Task 1: Extract shared DB module

**Files:**
- Create: `db.js`
- Modify: `server.js:1-19`

**Step 1: Create db.js**

Create `db.js` — shared database initialization used by both server.js and cli.js:

```js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'pushups.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    name TEXT PRIMARY KEY,
    secret TEXT NOT NULL UNIQUE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pushup_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    count INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
```

**Step 2: Update server.js to use db.js**

Replace lines 1-19 of `server.js`. Remove the `Database` require, `db` creation, and `CREATE TABLE` block. Replace with:

```js
const express = require('express');
const path = require('path');
const db = require('./db');
```

Remove these lines entirely (old DB setup):
```js
const Database = require('better-sqlite3');
// ...
const db = new Database(path.join(__dirname, 'data', 'pushups.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS pushup_entries (
  ...
`);
```

**Step 3: Test server still starts**

```bash
node server.js &
curl http://localhost:3000/api/totals
kill %1
```

**Step 4: Commit**

```
git add db.js server.js
git commit -m "Extract shared DB module with users table"
```

---

### Task 2: Update server.js to use DB lookups

**Files:**
- Modify: `server.js`

**Step 1: Remove hardcoded PEOPLE and SECRET_TO_PERSON**

Delete lines 21-33 (the `PEOPLE` object, `SECRET_TO_PERSON` object, and the for loop).

**Step 2: Rewrite all routes to use DB queries**

Replace the entire route section of `server.js` (after `app.use(express.static(...))`) with:

```js
// API: get totals for all users
app.get('/api/totals', (req, res) => {
  const users = db.prepare('SELECT name FROM users ORDER BY name').all();
  const totals = {};
  for (const u of users) {
    totals[u.name] = 0;
  }
  const rows = db.prepare(
    'SELECT person, COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE person IN (SELECT name FROM users) GROUP BY person'
  ).all();
  for (const row of rows) {
    totals[row.person] = row.total;
  }
  res.json(totals);
});

// API: add pushups
app.post('/api/push', (req, res) => {
  const { person, count, secret } = req.body;

  const user = db.prepare('SELECT name FROM users WHERE name = ? AND secret = ?').get(person, secret);
  if (!user) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const num = parseInt(count, 10);
  if (Number.isNaN(num) || num < 1 || num > 250) {
    return res.status(400).json({ error: 'Count must be 1-250' });
  }

  db.prepare('INSERT INTO pushup_entries (person, count) VALUES (?, ?)').run(person, num);

  const row = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE person = ?').get(person);
  res.json({ total: row.total });
});

// API: get admin info by secret
app.get('/api/admin-info', (req, res) => {
  const secret = req.query.secret;
  const user = db.prepare('SELECT name FROM users WHERE secret = ?').get(secret);
  if (!user) {
    return res.status(404).json({ error: 'Not found' });
  }
  const row = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE person = ?').get(user.name);
  res.json({ person: user.name, total: row.total });
});

// Admin page: serve admin.html for secret URLs
app.get('/:secret', (req, res) => {
  const user = db.prepare('SELECT name FROM users WHERE secret = ?').get(req.params.secret);
  if (!user) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
```

**Step 3: Test with curl (no users yet, should return empty)**

```bash
node server.js &
curl http://localhost:3000/api/totals
# Expected: {}
kill %1
```

**Step 4: Commit**

```
git add server.js
git commit -m "Replace hardcoded users with DB lookups"
```

---

### Task 3: Create cli.js

**Files:**
- Create: `cli.js`

**Step 1: Create cli.js**

```js
const db = require('./db');

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`Pushup Tracker CLI

Usage:
  node cli.js add-user <NAME> <SECRET>    Add a new user
  node cli.js list-users                  List all users
  node cli.js remove-user <NAME>          Remove a user (keeps pushup history)
  node cli.js help                        Show this help

Examples:
  node cli.js add-user MAIT mait3242
  node cli.js list-users
  node cli.js remove-user MAIT`);
}

switch (command) {
  case 'add-user': {
    const name = args[1];
    const secret = args[2];
    if (!name || !secret) {
      console.error('Usage: node cli.js add-user <NAME> <SECRET>');
      process.exit(1);
    }
    try {
      db.prepare('INSERT INTO users (name, secret) VALUES (?, ?)').run(name.toUpperCase(), secret);
      console.log(`User ${name.toUpperCase()} added.`);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        console.error(`Error: User or secret already exists.`);
        process.exit(1);
      }
      throw e;
    }
    break;
  }
  case 'list-users': {
    const users = db.prepare('SELECT name FROM users ORDER BY name').all();
    if (users.length === 0) {
      console.log('No users.');
    } else {
      for (const u of users) {
        console.log(u.name);
      }
    }
    break;
  }
  case 'remove-user': {
    const name = args[1];
    if (!name) {
      console.error('Usage: node cli.js remove-user <NAME>');
      process.exit(1);
    }
    const result = db.prepare('DELETE FROM users WHERE name = ?').run(name.toUpperCase());
    if (result.changes === 0) {
      console.error(`User ${name.toUpperCase()} not found.`);
      process.exit(1);
    }
    console.log(`User ${name.toUpperCase()} removed. Pushup history kept.`);
    break;
  }
  case 'help':
  default:
    printHelp();
    break;
}
```

**Step 2: Test CLI**

```bash
node cli.js
# Expected: prints help

node cli.js add-user MAIT mait3242
# Expected: User MAIT added.

node cli.js add-user RAIT rait3242
# Expected: User RAIT added.

node cli.js list-users
# Expected:
# MAIT
# RAIT

node cli.js remove-user RAIT
# Expected: User RAIT removed. Pushup history kept.

node cli.js add-user MAIT mait3242
# Expected: Error: User or secret already exists.
```

**Step 3: Test full flow with server**

```bash
node server.js &
curl http://localhost:3000/api/totals
# Expected: {"MAIT":0}

curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"person":"MAIT","count":25,"secret":"mait3242"}'
# Expected: {"total":25}

curl http://localhost:3000/api/totals
# Expected: {"MAIT":25}

kill %1
```

**Step 4: Clean up test data**

```bash
rm -f data/pushups.db data/pushups.db-wal data/pushups.db-shm
```

**Step 5: Commit**

```
git add cli.js
git commit -m "Add CLI for user management"
```

---

### Task 4: Make public page dynamic

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/odometer.js`

**Step 1: Replace hardcoded HTML with empty board container**

Replace the entire `<body>` content of `public/index.html` with:

```html
<body>
  <div class="board" id="board"></div>
  <script src="/js/odometer.js"></script>
</body>
```

**Step 2: Rewrite odometer.js to generate HTML dynamically**

Replace entire `public/js/odometer.js` with:

```js
function getDigitHeight() {
  return window.innerWidth <= 600 ? 44 : 56;
}

function createOdometerHTML(name) {
  const digitSlot = `<div class="digit-slot"><div class="digit-reel">${
    [0,1,2,3,4,5,6,7,8,9].map(d => `<span>${d}</span>`).join('')
  }</div></div>`;
  return `
    <div class="person" data-person="${name}">
      <div class="name">${name}</div>
      <div class="odometer" id="odo-${name}">
        ${digitSlot.repeat(5)}
      </div>
    </div>`;
}

function setOdometer(personId, value) {
  const odo = document.getElementById(`odo-${personId}`);
  if (!odo) return;
  const height = getDigitHeight();
  const digits = String(value).padStart(5, '0').split('');
  const reels = odo.querySelectorAll('.digit-reel');
  reels.forEach((reel, i) => {
    const digit = parseInt(digits[i], 10);
    reel.style.transform = `translateY(-${digit * height}px)`;
  });
}

let knownUsers = [];

async function fetchTotals() {
  try {
    const res = await fetch('/api/totals');
    const data = await res.json();
    const users = Object.keys(data);

    // Rebuild board if users changed
    if (JSON.stringify(users) !== JSON.stringify(knownUsers)) {
      knownUsers = users;
      const board = document.getElementById('board');
      board.innerHTML = users.length > 0
        ? users.map(name => createOdometerHTML(name)).join('')
        : '<div class="empty">No users yet</div>';
    }

    for (const [person, total] of Object.entries(data)) {
      setOdometer(person, total);
    }
  } catch (e) {
    console.error('Failed to fetch totals:', e);
  }
}

// Initial load
fetchTotals();

// Refresh every 30 seconds
setInterval(fetchTotals, 30000);
```

**Step 3: Add empty state CSS to odometer.css**

Append to `public/css/odometer.css`:

```css
.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: #666;
  font-size: 1.2rem;
}
```

**Step 4: Commit**

```
git add public/index.html public/js/odometer.js public/css/odometer.css
git commit -m "Make public page render users dynamically from API"
```

---

### Task 5: Clean up docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Remove per-user env vars**

Replace `docker-compose.yml` with:

```yaml
services:
  pushups:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

**Step 2: Rebuild and test**

```bash
docker compose up --build -d

# Add users via docker exec
docker exec pushups-pushups-1 node cli.js add-user MAIT mait3242
docker exec pushups-pushups-1 node cli.js add-user RENNO renno3242
docker exec pushups-pushups-1 node cli.js add-user RAIN rain3242
docker exec pushups-pushups-1 node cli.js add-user RAIT rait3242

# Verify
docker exec pushups-pushups-1 node cli.js list-users
# Expected:
# MAIT
# RAIN
# RAIT
# RENNO

curl http://localhost:3000/api/totals
# Expected: {"MAIT":0,"RAIN":0,"RAIT":0,"RENNO":0}

# Test help
docker exec pushups-pushups-1 node cli.js
# Expected: prints help

docker compose down
```

**Step 3: Commit**

```
git add docker-compose.yml
git commit -m "Remove hardcoded user env vars from docker-compose"
```
