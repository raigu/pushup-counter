const db = require('./db');

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`Pushup Tracker CLI

Usage:
  node cli.js add-user <NAME> <SECRET>    Add a new user
  node cli.js list-users                  List all users
  node cli.js remove-user <NAME>          Remove a user (keeps pushup history)
  node cli.js help                        Show this help

Examples:
  node cli.js add-user mait mait3242
  node cli.js list-users
  node cli.js remove-user mait`);
}

switch (command) {
  case 'add-user': {
    const name = args[1];
    const secret = args[2];
    if (!name || !secret) {
      console.error('Usage: node cli.js add-user <NAME> <SECRET>');
      process.exit(1);
    }
    try {
      db.prepare('INSERT INTO users (name, secret) VALUES (?, ?)').run(name.toLowerCase(), secret);
      console.log(`User ${name.toLowerCase()} added.`);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        console.error(`Error: User or secret already exists.`);
        process.exit(1);
      }
      throw e;
    }
    break;
  }
  case 'list-users': {
    const users = db.prepare('SELECT name FROM users ORDER BY name').all();
    if (users.length === 0) {
      console.log('No users.');
    } else {
      for (const u of users) {
        console.log(u.name);
      }
    }
    break;
  }
  case 'remove-user': {
    const name = args[1];
    if (!name) {
      console.error('Usage: node cli.js remove-user <NAME>');
      process.exit(1);
    }
    const result = db.prepare('DELETE FROM users WHERE name = ?').run(name.toLowerCase());
    if (result.changes === 0) {
      console.error(`User ${name.toLowerCase()} not found.`);
      process.exit(1);
    }
    console.log(`User ${name.toLowerCase()} removed. Pushup history kept.`);
    break;
  }
  case 'help':
  default:
    printHelp();
    break;
}
