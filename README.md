# Pushup Counter

Track pushup progress for a group of people. Each person has an analog odometer-style counter on a shared public page and a secret URL to log their pushups.

## Quick Start

```bash
docker pull ghcr.io/raigu/pushup-counter:latest

docker run -d \
  --name pushups \
  -p 3000:3000 \
  -v ./data:/app/data \
  --restart unless-stopped \
  ghcr.io/raigu/pushup-counter:latest
```

Or with docker compose:

```yaml
services:
  pushups:
    image: ghcr.io/raigu/pushup-counter:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

## Managing Users

Users are managed via CLI inside the container:

```bash
# Add a user (name stored lowercase, displayed uppercase)
docker exec pushups node cli.js add-user mait mait3242

# List users
docker exec pushups node cli.js list-users

# Remove a user (pushup history is kept)
docker exec pushups node cli.js remove-user mait

# Show help
docker exec pushups node cli.js
```

The second argument is the secret URL path. After adding a user with secret `mait3242`, their admin page is at `http://localhost:3000/mait3242`.

## Challenge

A challenge defines the time period for tracking pushups. Totals on the public dashboard only count pushups logged within the challenge period.

```bash
# Set challenge dates
docker exec pushups node cli.js set-challenge 2026-03-15 2027-03-15

# Set a title (displayed on the public dashboard)
docker exec pushups node cli.js set-title "Renno 50k"

# Clear the title
docker exec pushups node cli.js set-title

# Show current challenge
docker exec pushups node cli.js show-challenge
```

The title is optional. When no title is set, nothing is displayed and the dashboard looks the same as before. Run `set-title` without an argument to clear it.

## Pages

- `/` — Public dashboard with odometer counters for all users
- `/<secret>` — Admin page to log pushups (up to 250 per entry)

The public page auto-refreshes every 30 seconds.

## Updating

```bash
docker pull ghcr.io/raigu/pushup-counter:latest
docker stop pushups && docker rm pushups
docker run -d \
  --name pushups \
  -p 3000:3000 \
  -v ./data:/app/data \
  --restart unless-stopped \
  ghcr.io/raigu/pushup-counter:latest
```

Or with docker compose:

```bash
docker compose pull
docker compose up -d
```

Data is preserved in the `./data` volume. Database schema migrations run automatically on startup — no manual steps needed.

## Database Migrations

Schema changes are handled via ordered migrations in `db.js`. On startup, the app checks the current schema version (`PRAGMA user_version`) and runs any new migrations.

Rules for contributors:
- **Never** modify an existing migration
- Only append new migrations to the array
- Each migration must be forward-only (no destructive changes without a data migration step)

## Development

```bash
git clone https://github.com/raigu/pushup-counter.git
cd pushup-counter
npm install
mkdir -p data
node cli.js add-user mait mait3242
node server.js
```

## Building from Source

```bash
docker compose up --build -d
```
