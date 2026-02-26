const express = require('express');
const path = require('path');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API: get totals for all users
  app.get('/api/totals', (req, res) => {
    const rows = db.prepare(`
      SELECT u.name, COALESCE(SUM(e.count), 0) as total
      FROM users u
      LEFT JOIN pushup_entries e ON e.user_id = u.id
      GROUP BY u.id
      ORDER BY u.name
    `).all();
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

  // API: get admin info by secret
  app.get('/api/admin-info', (req, res) => {
    const secret = req.query.secret;
    const user = db.prepare('SELECT id, name FROM users WHERE secret = ?').get(secret);
    if (!user) {
      return res.status(404).json({ error: 'Not found' });
    }
    const row = db.prepare('SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries WHERE user_id = ?').get(user.id);
    res.json({ person: user.name, total: row.total });
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
