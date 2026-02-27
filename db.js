const Database = require('better-sqlite3');
const path = require('path');

// Ordered list of migrations. NEVER modify existing migrations, only append new ones.
const migrations = [
  // 1: Create users table
  `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL UNIQUE
  )`,
  // 2: Create pushup_entries table
  `CREATE TABLE pushup_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    count INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // 3: Create settings table with challenge date defaults
  {
    sql: `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`,
    seed: (db) => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      if (endDate.getDate() !== now.getDate()) endDate.setDate(0);
      const end = endDate.toISOString().slice(0, 10);
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run('challenge_start', today);
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run('challenge_end', end);
    }
  },
];

function migrate(db) {
  const currentVersion = db.pragma('user_version', { simple: true });
  for (let i = currentVersion; i < migrations.length; i++) {
    const m = migrations[i];
    if (typeof m === 'string') {
      db.exec(m);
    } else {
      db.exec(m.sql);
      if (m.seed) m.seed(db);
    }
    db.pragma(`user_version = ${i + 1}`);
  }
}

function createDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

const db = createDb(path.join(__dirname, 'data', 'pushups.db'));

module.exports = db;
module.exports.createDb = createDb;
module.exports.migrations = migrations;
