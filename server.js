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
