const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createDb } = require('../db');
const createApp = require('../app');

function makeDb() {
  return createDb(':memory:');
}

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search };
    if (body) opts.headers = { 'Content-Type': 'application/json' };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function seedUser(db, name, secret) {
  db.prepare('INSERT INTO users (name, secret) VALUES (?, ?)').run(name, secret);
}

// --- DB migration tests ---

describe('DB migrations', () => {
  it('sets correct schema version', () => {
    const db = makeDb();
    const version = db.pragma('user_version', { simple: true });
    assert.equal(version, 7);
    db.close();
  });

  it('creates users and pushup_entries tables', () => {
    const db = makeDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('pushup_entries'));
    db.close();
  });

  it('adds rabbit columns to users table', () => {
    const db = makeDb();
    const info = db.prepare("PRAGMA table_info(users)").all();
    const colNames = info.map(c => c.name);
    assert.ok(colNames.includes('is_rabbit'));
    assert.ok(colNames.includes('rabbit_target'));
    assert.ok(!colNames.includes('rabbit_interval'), 'rabbit_interval should be dropped');
    db.close();
  });

  it('creates settings table with default challenge dates', () => {
    const db = makeDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    assert.ok(tables.includes('settings'));
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get();
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get();
    assert.ok(start.value.match(/^\d{4}-\d{2}-\d{2}$/));
    assert.ok(end.value.match(/^\d{4}-\d{2}-\d{2}$/));
    assert.ok(new Date(end.value) > new Date(start.value));
    db.close();
  });
});

// --- API tests ---

describe('API', () => {
  let db, server;

  before((_, done) => {
    db = makeDb();
    const app = createApp(db);
    server = app.listen(0, done);
  });

  after((_, done) => {
    server.close(() => { db.close(); done(); });
  });

  describe('GET /api/challenge', () => {
    it('returns challenge start and end dates', async () => {
      const res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.status, 200);
      assert.ok(res.body.start.match(/^\d{4}-\d{2}-\d{2}$/));
      assert.ok(res.body.end.match(/^\d{4}-\d{2}-\d{2}$/));
    });

    it('does not include title when not set', async () => {
      db.prepare("DELETE FROM settings WHERE key = 'challenge_title'").run();
      const res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.status, 200);
      assert.equal(res.body.title, undefined);
    });

    it('includes title when set', async () => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_title', 'Renno 50k')").run();
      const res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Renno 50k');

      db.prepare("DELETE FROM settings WHERE key = 'challenge_title'").run();
    });

    it('title can be changed', async () => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_title', 'First title')").run();
      let res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.body.title, 'First title');

      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_title', 'Second title')").run();
      res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.body.title, 'Second title');

      db.prepare("DELETE FROM settings WHERE key = 'challenge_title'").run();
    });

    it('title disappears after being cleared', async () => {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_title', 'Temp')").run();
      let res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.body.title, 'Temp');

      db.prepare("DELETE FROM settings WHERE key = 'challenge_title'").run();
      res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.body.title, undefined);
    });

    it('does not include rabbits when none set', async () => {
      const res = await request(server, 'GET', '/api/challenge');
      assert.equal(res.body.rabbits, undefined);
    });

    it('includes rabbits array when rabbit users exist', async () => {
      db.prepare("INSERT INTO users (name, secret, is_rabbit, rabbit_target) VALUES (?, ?, 1, 3000)")
        .run('rabbit', 'sec-rabbit');

      const res = await request(server, 'GET', '/api/challenge');
      assert.deepEqual(res.body.rabbits, ['rabbit']);

      db.prepare("DELETE FROM users WHERE name = 'rabbit'").run();
    });
  });

  describe('GET /api/challenge/totals', () => {
    it('returns empty object when no users', async () => {
      const res = await request(server, 'GET', '/api/challenge/totals');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {});
    });

    it('returns only pushups within challenge period', async () => {
      const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
      const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;

      seedUser(db, 'alice', 'sec-alice');
      const userId = db.prepare('SELECT id FROM users WHERE name = ?').get('alice').id;

      // Entry within challenge period
      db.prepare("INSERT INTO pushup_entries (user_id, count, created_at) VALUES (?, 10, ?)").run(userId, start + ' 12:00:00');
      // Entry outside challenge period (before start)
      db.prepare("INSERT INTO pushup_entries (user_id, count, created_at) VALUES (?, 20, '2020-01-01 12:00:00')").run(userId);

      const res = await request(server, 'GET', '/api/challenge/totals');
      assert.equal(res.status, 200);
      assert.equal(res.body.alice, 10);

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });

    it('returns computed total for rabbit user', async () => {
      // Set challenge to a known past-to-future range so we're in the middle
      const now = new Date();
      const pastStart = new Date(now.getTime() - 15 * 86400000); // 15 days ago
      const futureEnd = new Date(now.getTime() + 15 * 86400000); // 15 days from now
      const startStr = pastStart.toISOString().slice(0, 10);
      const endStr = futureEnd.toISOString().slice(0, 10);
      const origStart = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
      const origEnd = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(startStr);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(endStr);

      db.prepare("INSERT INTO users (name, secret, is_rabbit, rabbit_target) VALUES (?, ?, 1, 3000)")
        .run('rabbit', 'sec-rabbit');

      const res = await request(server, 'GET', '/api/challenge/totals');
      assert.equal(res.status, 200);
      // Rabbit should be roughly halfway (around 1500), but exact value depends on timing
      assert.ok(typeof res.body.rabbit === 'number');
      assert.ok(res.body.rabbit > 0, 'rabbit total should be > 0 midway through challenge');
      assert.ok(res.body.rabbit < 3000, 'rabbit total should be < target before challenge ends');

      // Restore
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(origStart);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(origEnd);
      db.prepare("DELETE FROM users WHERE name = 'rabbit'").run();
    });

    it('returns 0 for rabbit user before challenge starts', async () => {
      const origStart = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
      const origEnd = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
      // Set challenge entirely in the future
      const futureStart = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
      const futureEnd = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(futureStart);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(futureEnd);

      db.prepare("INSERT INTO users (name, secret, is_rabbit, rabbit_target) VALUES (?, ?, 1, 3000)")
        .run('rabbit', 'sec-rabbit');

      const res = await request(server, 'GET', '/api/challenge/totals');
      assert.equal(res.status, 200);
      assert.equal(res.body.rabbit, 0);

      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(origStart);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(origEnd);
      db.prepare("DELETE FROM users WHERE name = 'rabbit'").run();
    });

    it('returns target for rabbit user after challenge ends', async () => {
      const origStart = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get().value;
      const origEnd = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get().value;
      // Set challenge entirely in the past
      const pastStart = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10);
      const pastEnd = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(pastStart);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(pastEnd);

      db.prepare("INSERT INTO users (name, secret, is_rabbit, rabbit_target) VALUES (?, ?, 1, 3000)")
        .run('rabbit', 'sec-rabbit');

      const res = await request(server, 'GET', '/api/challenge/totals');
      assert.equal(res.status, 200);
      assert.equal(res.body.rabbit, 3000);

      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(origStart);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(origEnd);
      db.prepare("DELETE FROM users WHERE name = 'rabbit'").run();
    });
  });

  describe('POST /api/push', () => {
    it('adds pushups with valid secret', async () => {
      seedUser(db, 'carol', 'sec-carol');
      const res = await request(server, 'POST', '/api/push', { person: 'carol', count: 25, secret: 'sec-carol' });
      assert.equal(res.status, 200);
      assert.equal(res.body.total, 25);

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });

    it('returns 403 for invalid secret', async () => {
      seedUser(db, 'dave', 'sec-dave');
      const res = await request(server, 'POST', '/api/push', { person: 'dave', count: 10, secret: 'wrong' });
      assert.equal(res.status, 403);

      db.prepare("DELETE FROM users").run();
    });

    it('returns 400 for invalid count', async () => {
      seedUser(db, 'eve', 'sec-eve');
      const res = await request(server, 'POST', '/api/push', { person: 'eve', count: 0, secret: 'sec-eve' });
      assert.equal(res.status, 400);

      db.prepare("DELETE FROM users").run();
    });

    it('returns counts_for_challenge true when within period', async () => {
      seedUser(db, 'carol', 'sec-carol');
      const res = await request(server, 'POST', '/api/push', { person: 'carol', count: 25, secret: 'sec-carol' });
      assert.equal(res.status, 200);
      assert.equal(res.body.counts_for_challenge, true);

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });

    it('returns counts_for_challenge false when outside period', async () => {
      seedUser(db, 'dave', 'sec-dave');
      // Set challenge to past dates
      db.prepare("UPDATE settings SET value = '2020-01-01' WHERE key = 'challenge_start'").run();
      db.prepare("UPDATE settings SET value = '2020-02-01' WHERE key = 'challenge_end'").run();

      const res = await request(server, 'POST', '/api/push', { person: 'dave', count: 10, secret: 'sec-dave' });
      assert.equal(res.status, 200);
      assert.equal(res.body.counts_for_challenge, false);

      // Restore challenge dates to defaults (today + 1 month)
      const today = new Date().toISOString().slice(0, 10);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_start'").run(today);
      db.prepare("UPDATE settings SET value = ? WHERE key = 'challenge_end'").run(endDate.toISOString().slice(0, 10));

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });
  });

  describe('GET /api/history', () => {
    it('returns 404 for invalid secret', async () => {
      const res = await request(server, 'GET', '/api/history?secret=nonexistent');
      assert.equal(res.status, 404);
    });

    it('returns empty array for user with no entries', async () => {
      seedUser(db, 'hank', 'sec-hank');
      const res = await request(server, 'GET', '/api/history?secret=sec-hank');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, []);

      db.prepare("DELETE FROM users").run();
    });

    it('returns entries in descending created_at order', async () => {
      seedUser(db, 'iris', 'sec-iris');
      const userId = db.prepare('SELECT id FROM users WHERE name = ?').get('iris').id;
      db.prepare("INSERT INTO pushup_entries (user_id, count, created_at) VALUES (?, 10, '2025-01-01 10:00:00')").run(userId);
      db.prepare("INSERT INTO pushup_entries (user_id, count, created_at) VALUES (?, 20, '2025-01-02 10:00:00')").run(userId);
      db.prepare("INSERT INTO pushup_entries (user_id, count, created_at) VALUES (?, 30, '2025-01-03 10:00:00')").run(userId);

      const res = await request(server, 'GET', '/api/history?secret=sec-iris');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 3);
      assert.equal(res.body[0].count, 30);
      assert.equal(res.body[1].count, 20);
      assert.equal(res.body[2].count, 10);

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });

    it('limits results to 10', async () => {
      seedUser(db, 'jake', 'sec-jake');
      const userId = db.prepare('SELECT id FROM users WHERE name = ?').get('jake').id;
      for (let i = 0; i < 15; i++) {
        db.prepare("INSERT INTO pushup_entries (user_id, count) VALUES (?, ?)").run(userId, i + 1);
      }

      const res = await request(server, 'GET', '/api/history?secret=sec-jake');
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 10);

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });
  });

  describe('GET /:secret', () => {
    it('returns 404 for invalid secret', async () => {
      const res = await request(server, 'GET', '/nosuchsecret');
      assert.equal(res.status, 404);
    });

    it('renders admin page with embedded user data for valid secret', async () => {
      seedUser(db, 'grace', 'sec-grace');
      db.prepare("INSERT INTO pushup_entries (user_id, count) VALUES (?, 30)").run(
        db.prepare('SELECT id FROM users WHERE name = ?').get('grace').id
      );
      const res = await request(server, 'GET', '/sec-grace');
      assert.equal(res.status, 200);
      assert.ok(typeof res.body === 'string'); // HTML response
      assert.ok(res.body.includes('grace'));
      assert.ok(res.body.includes('window.__USER__'));

      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
    });
  });
});
