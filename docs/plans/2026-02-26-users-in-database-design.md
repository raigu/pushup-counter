# Users in Database — Design

## Goal

Move user configuration from hardcoded env vars to a `users` table in SQLite. Users are managed via CLI inside the Docker container.

## Database

New table:

```sql
users (
  name    TEXT PRIMARY KEY,
  secret  TEXT NOT NULL UNIQUE
)
```

## Changes to server.js

- Create `users` table on startup (CREATE TABLE IF NOT EXISTS)
- Replace hardcoded `PEOPLE`/`SECRET_TO_PERSON` with DB queries
- `GET /api/totals` — returns totals only for users in `users` table
- `POST /api/push` — validates person+secret against `users` table
- `GET /api/admin-info` — looks up secret in `users` table
- `GET /:secret` — looks up secret in `users` table
- Remove per-user env vars from docker-compose.yml

## New file: cli.js

Usage via docker exec:

```bash
docker exec pushups-pushups-1 node cli.js add-user MAIT mait3242
docker exec pushups-pushups-1 node cli.js list-users
docker exec pushups-pushups-1 node cli.js remove-user MAIT
docker exec pushups-pushups-1 node cli.js   # prints help
```

Commands:
- `add-user <NAME> <SECRET>` — inserts user, validates no duplicates
- `list-users` — prints all users (name only, not secrets)
- `remove-user <NAME>` — removes user (keeps their pushup history)
- No args or unknown command — prints help text with usage examples

## Public page becomes dynamic

- Remove hardcoded odometer HTML from index.html
- JS fetches `/api/totals`, generates odometer blocks dynamically
- Empty state: show message if no users exist yet

## Removed

- Per-user env vars from docker-compose.yml
- Hardcoded PEOPLE/SECRET_TO_PERSON from server.js
- Hardcoded person names from index.html
