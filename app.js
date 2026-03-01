const express = require('express');
const fs = require('fs');
const path = require('path');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // API: get challenge dates and optional title
  app.get('/api/challenge', (req, res) => {
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get();
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get();
    const title = db.prepare("SELECT value FROM settings WHERE key = 'challenge_title'").get();
    const result = { start: start.value, end: end.value };
    if (title) result.title = title.value;
    const rabbits = db.prepare("SELECT name FROM users WHERE is_rabbit = 1").all().map(r => r.name);
    if (rabbits.length > 0) result.rabbits = rabbits;
    res.json(result);
  });

  // Compute a rabbit user's current virtual total based on elapsed time
  function getRabbitTotal(target, interval, startStr, endStr) {
    const now = new Date();
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if (now <= start) return 0;
    if (now >= end) return target;
    const totalMinutes = (end - start) / 60000;
    const elapsedMinutes = (now - start) / 60000;
    const totalIntervals = Math.floor(totalMinutes / interval);
    if (totalIntervals <= 0) return target;
    const intervalsElapsed = Math.floor(elapsedMinutes / interval);
    return Math.floor(target * intervalsElapsed / totalIntervals);
  }

  // API: get totals within challenge period
  app.get('/api/challenge/totals', (req, res) => {
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
    const rows = db.prepare(`
      SELECT u.name, u.is_rabbit, u.rabbit_target, u.rabbit_interval,
             COALESCE(SUM(e.count), 0) as total
      FROM users u
      LEFT JOIN pushup_entries e ON e.user_id = u.id
        AND e.created_at >= ? AND e.created_at < date(?, '+1 day')
      GROUP BY u.id
      ORDER BY u.name
    `).all(start, end);
    const totals = {};
    for (const row of rows) {
      if (row.is_rabbit) {
        totals[row.name] = getRabbitTotal(row.rabbit_target, row.rabbit_interval, start, end);
      } else {
        totals[row.name] = row.total;
      }
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

    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
    const now = new Date().toISOString().slice(0, 10);
    const countsForChallenge = now >= start && now <= end;

    const row = db.prepare(`
      SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries
      WHERE user_id = ? AND created_at >= ? AND created_at < date(?, '+1 day')
    `).get(user.id, start, end);
    res.json({ total: row.total, counts_for_challenge: countsForChallenge });
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
    const user = db.prepare('SELECT id, name FROM users WHERE secret = ?').get(req.params.secret);
    if (!user) {
      return res.status(404).send('Not found');
    }
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
    const row = db.prepare(`
      SELECT COALESCE(SUM(count), 0) as total FROM pushup_entries
      WHERE user_id = ? AND created_at >= ? AND created_at < date(?, '+1 day')
    `).get(user.id, start, end);

    const html = fs.readFileSync(path.join(__dirname, 'public', 'admin.html'), 'utf8');
    const injected = html.replace(
      '</head>',
      `<script>window.__USER__ = ${JSON.stringify({ person: user.name, total: row.total, secret: req.params.secret })};</script>\n</head>`
    );
    res.type('html').send(injected);
  });

  return app;
}

module.exports = createApp;
