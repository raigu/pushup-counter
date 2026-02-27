const express = require('express');
const path = require('path');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API: get challenge dates
  app.get('/api/challenge', (req, res) => {
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get();
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get();
    res.json({ start: start.value, end: end.value });
  });

  // API: get totals within challenge period
  app.get('/api/challenge/totals', (req, res) => {
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
    const rows = db.prepare(`
      SELECT u.name, COALESCE(SUM(e.count), 0) as total
      FROM users u
      LEFT JOIN pushup_entries e ON e.user_id = u.id
        AND e.created_at >= ? AND e.created_at < date(?, '+1 day')
      GROUP BY u.id
      ORDER BY u.name
    `).all(start, end);
    const totals = {};
    for (const row of rows) {
      totals[row.name] = row.total;
    }
    res.json(totals);
  });

  // API: add pushups
  app.post('/api/push', (req, res) => {
    const { person, count, secret } = req.body;

    const user = db.prepare('SELECT id, name FROM users WHERE name = ? AND secret = ?').get(person, secret);
    if (!user) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const num = parseInt(count, 10);
    if (Number.isNaN(num) || num < 1 || num > 250) {
      return res.status(400).json({ error: 'Count must be 1-250' });
    }

    db.prepare('INSERT INTO pushup_entries (user_id, count) VALUES (?, ?)').run(user.id, num);

    const row = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE user_id = ?').get(user.id);
    res.json({ total: row.total });
  });

  // API: get recent entries for user
  app.get('/api/history', (req, res) => {
    const secret = req.query.secret;
    const user = db.prepare('SELECT id FROM users WHERE secret = ?').get(secret);
    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }
    const rows = db.prepare(
      'SELECT count, created_at FROM pushup_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 10'
    ).all(user.id);
    res.json(rows);
  });

  // Admin page: serve admin.html for secret URLs
  app.get('/:secret', (req, res) => {
    const user = db.prepare('SELECT id FROM users WHERE secret = ?').get(req.params.secret);
    if (!user) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  return app;
}

module.exports = createApp;
