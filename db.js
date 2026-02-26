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
];

function migrate(db) {
  const currentVersion = db.pragma('user_version', { simple: true });
  for (let i = currentVersion; i < migrations.length; i++) {
    db.exec(migrations[i]);
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
