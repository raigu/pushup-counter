const db = require('./db');

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`Pushup Tracker CLI

Usage:
  node cli.js add-user <NAME> <SECRET>    Add a new user
  node cli.js list-users                  List all users
  node cli.js remove-user <NAME>          Remove a user (keeps pushup history)
  node cli.js set-challenge <START> <END>  Set challenge start/end dates
  node cli.js set-title [TITLE]            Set or clear challenge title
  node cli.js show-challenge               Show current challenge dates and title
  node cli.js set-rabbit <NAME> <TARGET>   Mark user as rabbit pace-setter
  node cli.js unset-rabbit <NAME>          Remove rabbit status from user
  node cli.js help                        Show this help

Examples:
  node cli.js add-user mait mait3242
  node cli.js list-users
  node cli.js remove-user mait
  node cli.js set-rabbit rabbit 3000      Set rabbit to reach 3000 pushups by challenge end`);
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
    const users = db.prepare('SELECT name, is_rabbit, rabbit_target FROM users ORDER BY name').all();
    if (users.length === 0) {
      console.log('No users.');
    } else {
      for (const u of users) {
        if (u.is_rabbit) {
          console.log(`${u.name} [rabbit: target=${u.rabbit_target}]`);
        } else {
          console.log(u.name);
        }
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
  case 'set-challenge': {
    const start = args[1];
    const end = args[2];
    if (!start || !end) {
      console.error('Usage: node cli.js set-challenge <START_DATE> <END_DATE>');
      console.error('Example: node cli.js set-challenge 2026-03-15 2027-03-15');
      process.exit(1);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      console.error('Error: Dates must be in YYYY-MM-DD format.');
      process.exit(1);
    }
    if (new Date(start) >= new Date(end)) {
      console.error('Error: Start date must be before end date.');
      process.exit(1);
    }
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_start', ?)").run(start);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_end', ?)").run(end);
    console.log(`Challenge: ${start} to ${end}`);
    break;
  }
  case 'set-title': {
    const title = args[1];
    if (title) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('challenge_title', ?)").run(title);
      console.log(`Title set: ${title}`);
    } else {
      db.prepare("DELETE FROM settings WHERE key = 'challenge_title'").run();
      console.log('Title cleared.');
    }
    break;
  }
  case 'show-challenge': {
    const start = db.prepare("SELECT value FROM settings WHERE key = 'challenge_start'").get();
    const end = db.prepare("SELECT value FROM settings WHERE key = 'challenge_end'").get();
    const title = db.prepare("SELECT value FROM settings WHERE key = 'challenge_title'").get();
    if (!start || !end) {
      console.log('No challenge dates set.');
    } else if (title) {
      console.log(`Challenge "${title.value}": ${start.value} to ${end.value}`);
    } else {
      console.log(`Challenge: ${start.value} to ${end.value}`);
    }
    break;
  }
  case 'set-rabbit': {
    const name = args[1];
    const target = parseInt(args[2], 10);
    if (!name || !target || Number.isNaN(target) || target < 1) {
      console.error('Usage: node cli.js set-rabbit <NAME> <TARGET>');
      console.error('  TARGET: total pushups the rabbit should reach by challenge end');
      process.exit(1);
    }
    const user = db.prepare('SELECT id FROM users WHERE name = ?').get(name.toLowerCase());
    if (!user) {
      console.error(`Error: User ${name.toLowerCase()} not found. Add the user first.`);
      process.exit(1);
    }
    db.prepare('UPDATE users SET is_rabbit = 1, rabbit_target = ? WHERE name = ?')
      .run(target, name.toLowerCase());
    console.log(`User ${name.toLowerCase()} set as rabbit: target=${target}`);
    break;
  }
  case 'unset-rabbit': {
    const name = args[1];
    if (!name) {
      console.error('Usage: node cli.js unset-rabbit <NAME>');
      process.exit(1);
    }
    const result = db.prepare('UPDATE users SET is_rabbit = 0, rabbit_target = 0 WHERE name = ?')
      .run(name.toLowerCase());
    if (result.changes === 0) {
      console.error(`User ${name.toLowerCase()} not found.`);
      process.exit(1);
    }
    console.log(`Rabbit status removed from ${name.toLowerCase()}.`);
    break;
  }
  case 'help':
  default:
    printHelp();
    break;
}
