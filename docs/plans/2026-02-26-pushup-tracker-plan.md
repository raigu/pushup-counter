# Pushup Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dockerized pushup tracking app with analog odometer UI for 4 people.

**Architecture:** Single Express server with SQLite, serving static HTML/CSS/JS. Secret URLs for admin access. No build step.

**Tech Stack:** Node.js, Express, better-sqlite3, vanilla HTML/CSS/JS, Docker

---

### Task 1: Project scaffolding + database

**Files:**
- Create: `package.json`
- Create: `server.js`
- Create: `data/` (directory)

**Step 1: Initialize package.json**

```bash
cd /home/rait/dev/gs/pushups
npm init -y
```

Then edit `package.json` to set name and add dependencies:

```json
{
  "name": "pushup-tracker",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0"
  }
}
```

**Step 2: Install dependencies**

```bash
npm install
```

**Step 3: Create server.js with database init and API routes**

Create `server.js`:

```js
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new Database(path.join(__dirname, 'data', 'pushups.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS pushup_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    count INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Config: secret paths from env vars
const PEOPLE = {
  MAIT: process.env.MAIT_PATH || 'mait3242',
  RENNO: process.env.RENNO_PATH || 'renno3242',
  RAIN: process.env.RAIN_PATH || 'rain3242',
  RAIT: process.env.RAIT_PATH || 'rait3242',
};

// Reverse lookup: secret -> person name
const SECRET_TO_PERSON = {};
for (const [person, secret] of Object.entries(PEOPLE)) {
  SECRET_TO_PERSON[secret] = person;
}

// API: get totals
app.get('/api/totals', (req, res) => {
  const rows = db.prepare(
    'SELECT person, COALESCE(SUM(count), 0) as total FROM pushup_entries GROUP BY person'
  ).all();
  const totals = { MAIT: 0, RENNO: 0, RAIN: 0, RAIT: 0 };
  for (const row of rows) {
    totals[row.person] = row.total;
  }
  res.json(totals);
});

// API: add pushups
app.post('/api/push', (req, res) => {
  const { person, count, secret } = req.body;

  if (!person || !PEOPLE[person]) {
    return res.status(400).json({ error: 'Invalid person' });
  }
  if (!secret || PEOPLE[person] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const num = parseInt(count, 10);
  if (!num || num < 1 || num > 250) {
    return res.status(400).json({ error: 'Count must be 1-250' });
  }

  db.prepare('INSERT INTO pushup_entries (person, count) VALUES (?, ?)').run(person, num);

  const row = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE person = ?').get(person);
  res.json({ total: row.total });
});

// Admin page: serve admin.html for secret URLs
app.get('/:secret', (req, res) => {
  const person = SECRET_TO_PERSON[req.params.secret];
  if (!person) {
    return res.status(404).send('Not found');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pushup tracker running on port ${PORT}`);
});
```

**Step 4: Create data directory**

```bash
mkdir -p data
```

**Step 5: Test server starts**

```bash
node server.js &
curl http://localhost:3000/api/totals
# Expected: {"MAIT":0,"RENNO":0,"RAIN":0,"RAIT":0}
kill %1
```

**Step 6: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "Add Express server with SQLite and API routes"
```

---

### Task 2: Admin page

**Files:**
- Create: `public/admin.html`
- Create: `public/js/admin.js`

**Step 1: Create admin.html**

Create `public/admin.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Add Pushups</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a2e;
      color: #eee;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      background: #16213e;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      max-width: 400px;
      width: 100%;
    }
    h1 { font-size: 2rem; margin-bottom: 8px; }
    .total { font-size: 1.2rem; color: #aaa; margin-bottom: 32px; }
    input[type="number"] {
      width: 100%;
      padding: 16px;
      font-size: 2rem;
      text-align: center;
      border: 2px solid #333;
      border-radius: 8px;
      background: #0f3460;
      color: #fff;
      margin-bottom: 16px;
    }
    button {
      width: 100%;
      padding: 16px;
      font-size: 1.2rem;
      border: none;
      border-radius: 8px;
      background: #e94560;
      color: #fff;
      cursor: pointer;
      font-weight: bold;
    }
    button:hover { background: #c73e54; }
    button:disabled { background: #555; cursor: not-allowed; }
    .message {
      margin-top: 16px;
      padding: 12px;
      border-radius: 8px;
      display: none;
    }
    .message.success { display: block; background: #1b4332; color: #95d5b2; }
    .message.error { display: block; background: #461111; color: #ff6b6b; }
  </style>
</head>
<body>
  <div class="container">
    <h1 id="person-name">—</h1>
    <div class="total">Total: <span id="current-total">0</span></div>
    <input type="number" id="count-input" min="1" max="250" value="50" placeholder="Pushups">
    <button id="submit-btn" onclick="submitPushups()">Submit</button>
    <div id="message" class="message"></div>
  </div>
  <script src="/js/admin.js"></script>
</body>
</html>
```

**Step 2: Create admin.js**

Create `public/js/admin.js`:

```js
// Extract secret from URL path
const secret = window.location.pathname.replace('/', '');
let person = null;

async function init() {
  // Fetch totals to find which person this secret belongs to
  // We pass the secret to a lightweight endpoint
  const res = await fetch(`/api/admin-info?secret=${encodeURIComponent(secret)}`);
  if (!res.ok) {
    document.getElementById('person-name').textContent = 'Invalid link';
    document.getElementById('submit-btn').disabled = true;
    return;
  }
  const data = await res.json();
  person = data.person;
  document.getElementById('person-name').textContent = person;
  document.getElementById('current-total').textContent = data.total;
}

async function submitPushups() {
  const input = document.getElementById('count-input');
  const count = parseInt(input.value, 10);
  const msg = document.getElementById('message');
  const btn = document.getElementById('submit-btn');

  if (!count || count < 1 || count > 250) {
    msg.className = 'message error';
    msg.textContent = 'Enter a number between 1 and 250';
    return;
  }

  btn.disabled = true;
  try {
    const res = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person, count, secret }),
    });
    const data = await res.json();
    if (!res.ok) {
      msg.className = 'message error';
      msg.textContent = data.error || 'Error';
      return;
    }
    msg.className = 'message success';
    msg.textContent = `Added ${count} pushups! New total: ${data.total}`;
    document.getElementById('current-total').textContent = data.total;
    input.value = 50;
  } catch (e) {
    msg.className = 'message error';
    msg.textContent = 'Network error';
  } finally {
    btn.disabled = false;
  }
}

init();
```

**Step 3: Add admin-info API endpoint to server.js**

Add this route in `server.js` BEFORE the `/:secret` catch-all route:

```js
// API: get admin info (person name + total) by secret
app.get('/api/admin-info', (req, res) => {
  const secret = req.query.secret;
  const person = SECRET_TO_PERSON[secret];
  if (!person) {
    return res.status(404).json({ error: 'Not found' });
  }
  const row = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE person = ?').get(person);
  res.json({ person, total: row.total });
});
```

**Step 4: Test admin page**

```bash
node server.js &
# Test admin-info endpoint
curl "http://localhost:3000/api/admin-info?secret=mait3242"
# Expected: {"person":"MAIT","total":0}

# Test adding pushups
curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"person":"MAIT","count":25,"secret":"mait3242"}'
# Expected: {"total":25}

# Test invalid secret
curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"person":"MAIT","count":25,"secret":"wrong"}'
# Expected: 403 {"error":"Forbidden"}

kill %1
```

**Step 5: Commit**

```bash
git add public/admin.html public/js/admin.js server.js
git commit -m "Add admin page for submitting pushups"
```

---

### Task 3: Public page — HTML structure

**Files:**
- Create: `public/index.html`

**Step 1: Create index.html**

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pushup Tracker</title>
  <link rel="stylesheet" href="/css/odometer.css">
</head>
<body>
  <div class="board">
    <div class="person" data-person="MAIT">
      <div class="name">MAIT</div>
      <div class="odometer" id="odo-MAIT">
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
      </div>
    </div>
    <div class="person" data-person="RENNO">
      <div class="name">RENNO</div>
      <div class="odometer" id="odo-RENNO">
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
      </div>
    </div>
    <div class="person" data-person="RAIN">
      <div class="name">RAIN</div>
      <div class="odometer" id="odo-RAIN">
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
      </div>
    </div>
    <div class="person" data-person="RAIT">
      <div class="name">RAIT</div>
      <div class="odometer" id="odo-RAIT">
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
        <div class="digit-slot"><div class="digit-reel"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></div></div>
      </div>
    </div>
  </div>
  <script src="/js/odometer.js"></script>
</body>
</html>
```

**Step 2: Commit**

```bash
git add public/index.html
git commit -m "Add public page HTML with odometer structure"
```

---

### Task 4: Odometer CSS

**Files:**
- Create: `public/css/odometer.css`

**Step 1: Create odometer.css**

Create `public/css/odometer.css`:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Courier New', monospace;
  background: #111;
  color: #eee;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  max-width: 800px;
  width: 100%;
}

@media (max-width: 600px) {
  .board {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

.person {
  text-align: center;
}

.name {
  font-size: 1.5rem;
  font-weight: bold;
  letter-spacing: 4px;
  margin-bottom: 12px;
  color: #ccc;
}

.odometer {
  display: inline-flex;
  gap: 2px;
  background: #222;
  padding: 8px 12px;
  border-radius: 8px;
  border: 2px solid #444;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
}

.digit-slot {
  width: 40px;
  height: 56px;
  overflow: hidden;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #333;
  position: relative;
}

/* Gradient overlay for depth effect */
.digit-slot::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to bottom,
    rgba(0,0,0,0.4) 0%,
    transparent 30%,
    transparent 70%,
    rgba(0,0,0,0.4) 100%
  );
  z-index: 2;
  pointer-events: none;
}

.digit-reel {
  display: flex;
  flex-direction: column;
  transition: transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1);
}

.digit-reel span {
  width: 40px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: bold;
  color: #f0f0f0;
}

@media (max-width: 600px) {
  .digit-slot {
    width: 32px;
    height: 44px;
  }
  .digit-reel span {
    width: 32px;
    height: 44px;
    font-size: 1.5rem;
  }
  .name {
    font-size: 1.2rem;
  }
}
```

**Step 2: Commit**

```bash
git add public/css/odometer.css
git commit -m "Add odometer CSS with rolling digit styling"
```

---

### Task 5: Odometer JavaScript

**Files:**
- Create: `public/js/odometer.js`

**Step 1: Create odometer.js**

Create `public/js/odometer.js`:

```js
function setOdometer(personId, value) {
  const odo = document.getElementById(`odo-${personId}`);
  if (!odo) return;
  const digits = String(value).padStart(5, '0').split('');
  const reels = odo.querySelectorAll('.digit-reel');
  reels.forEach((reel, i) => {
    const digit = parseInt(digits[i], 10);
    reel.style.transform = `translateY(-${digit * 56}px)`;
  });
}

// Adjust digit height for mobile
function updateDigitHeight() {
  const isMobile = window.innerWidth <= 600;
  const height = isMobile ? 44 : 56;
  document.querySelectorAll('.digit-reel').forEach(reel => {
    const digits = reel.querySelectorAll('span');
    const currentDigit = Math.round(
      Math.abs(parseFloat(reel.style.transform?.replace(/[^0-9.-]/g, '') || '0')) / 56
    );
    reel.style.transform = `translateY(-${currentDigit * height}px)`;
  });
}

async function fetchTotals() {
  try {
    const res = await fetch('/api/totals');
    const data = await res.json();
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

// Handle resize
window.addEventListener('resize', updateDigitHeight);
```

**Step 2: Test end-to-end**

```bash
node server.js &

# Add some test data
curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"person":"MAIT","count":123,"secret":"mait3242"}'

curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{"person":"RAIN","count":250,"secret":"rain3242"}'

# Check totals
curl http://localhost:3000/api/totals
# Expected: {"MAIT":123,"RENNO":0,"RAIN":250,"RAIT":0}

kill %1
```

**Step 3: Commit**

```bash
git add public/js/odometer.js
git commit -m "Add odometer JS with auto-refresh"
```

---

### Task 6: Docker setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Step 1: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
data
.git
docs
```

**Step 2: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
```

**Step 3: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  pushups:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - MAIT_PATH=mait3242
      - RENNO_PATH=renno3242
      - RAIN_PATH=rain3242
      - RAIT_PATH=rait3242
    restart: unless-stopped
```

**Step 4: Build and test**

```bash
docker compose up --build -d
curl http://localhost:3000/api/totals
# Expected: {"MAIT":0,"RENNO":0,"RAIN":0,"RAIT":0}
docker compose down
```

**Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "Add Docker setup"
```

---

### Task 7: Manual browser test + fix odometer mobile sizing

**Step 1: Start the app**

```bash
docker compose up --build -d
```

**Step 2: Open in browser and test**

- Open `http://localhost:3000` — verify 4 odometers show 00000
- Open `http://localhost:3000/mait3242` — verify admin page loads for MAIT
- Enter 50 and submit — verify success message and total updates
- Go back to main page — verify MAIT odometer shows 00050
- Resize browser to mobile width — verify single column layout
- Test all 4 admin URLs work

**Step 3: Fix any issues found during testing**

**Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "Fix issues found during browser testing"
```

**Step 5: Clean up**

```bash
docker compose down
```
