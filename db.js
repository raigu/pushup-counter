const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'pushups.db'));
db.pragma('journal_mode = WAL');

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

const currentVersion = db.pragma('user_version', { simple: true });

for (let i = currentVersion; i < migrations.length; i++) {
  db.exec(migrations[i]);
  db.pragma(`user_version = ${i + 1}`);
}

module.exports = db;
