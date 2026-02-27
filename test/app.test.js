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
    assert.equal(version, 3);
    db.close();
  });

  it('creates users and pushup_entries tables', () => {
    const db = makeDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('pushup_entries'));
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

  describe('GET /api/totals', () => {
    it('returns empty object when no users', async () => {
      const res = await request(server, 'GET', '/api/totals');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {});
    });

    it('returns totals after adding users and pushups', async () => {
      seedUser(db, 'alice', 'sec-alice');
      seedUser(db, 'bob', 'sec-bob');
      db.prepare("INSERT INTO pushup_entries (user_id, count) VALUES (1, 10)").run();
      db.prepare("INSERT INTO pushup_entries (user_id, count) VALUES (1, 5)").run();
      db.prepare("INSERT INTO pushup_entries (user_id, count) VALUES (2, 20)").run();

      const res = await request(server, 'GET', '/api/totals');
      assert.equal(res.status, 200);
      assert.equal(res.body.alice, 15);
      assert.equal(res.body.bob, 20);

      // cleanup
      db.prepare("DELETE FROM pushup_entries").run();
      db.prepare("DELETE FROM users").run();
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
  });

  describe('GET /api/admin-info', () => {
    it('returns user info for valid secret', async () => {
      seedUser(db, 'frank', 'sec-frank');
      const res = await request(server, 'GET', '/api/admin-info?secret=sec-frank');
      assert.equal(res.status, 200);
      assert.equal(res.body.person, 'frank');
      assert.equal(res.body.total, 0);

      db.prepare("DELETE FROM users").run();
    });

    it('returns 404 for invalid secret', async () => {
      const res = await request(server, 'GET', '/api/admin-info?secret=nonexistent');
      assert.equal(res.status, 404);
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
  });
});
