# Pushup Tracker — Design

## Goal

4 people (MAIT, RENNO, RAIN, RAIT) each need to complete 50,000 pushups between 15 March 2026 and 15 March 2027. This app tracks their progress.

## Architecture

Single Docker container running Node.js + Express with SQLite storage.

```
┌─────────────────────────────────────┐
│         Docker Container            │
│                                     │
│  Express Server (:3000)             │
│  ├── GET /           → public page  │
│  ├── GET /:secret    → admin page   │
│  ├── GET /api/totals → JSON totals  │
│  └── POST /api/push  → add pushups │
│                                     │
│  SQLite DB (volume-mounted)         │
│  └── pushup_entries table           │
└─────────────────────────────────────┘
```

- No build step, no bundler, no framework
- Static HTML/CSS/JS served by Express

## Data Model

```sql
pushup_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person      TEXT NOT NULL,        -- 'MAIT', 'RENNO', 'RAIN', 'RAIT'
  count       INTEGER NOT NULL,     -- 1-250
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

- Append-only log
- Totals via `SELECT person, SUM(count) FROM pushup_entries GROUP BY person`

## Pages

### Public page (`GET /`)

- 4 odometer displays (car analog style — rolling digit strips)
- Name label + 5-digit odometer per person
- Dark background, light digits
- Responsive: 2x2 grid on desktop, single column on mobile
- Auto-refreshes every 30s via fetch to `/api/totals`

### Admin page (`GET /:secret`)

- Person's name + current total
- Number input (1–250) + Submit button
- Success/error feedback inline

## API

### `GET /api/totals`

Returns: `{ "MAIT": 1230, "RENNO": 540, "RAIN": 890, "RAIT": 2100 }`

### `POST /api/push`

Body: `{ "person": "MAIT", "count": 50, "secret": "mait3242" }`

- Validates secret matches person, count is 1–250
- Returns `{ "total": 1280 }`
- 403 if secret wrong, 400 if count invalid

## Auth

Secret URL per person (env vars):

```
MAIT_PATH=mait3242
RENNO_PATH=renno3242
RAIN_PATH=rain3242
RAIT_PATH=rait3242
```

## File Structure

```
pushups/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── css/
│   │   └── odometer.css
│   └── js/
│       ├── odometer.js
│       └── admin.js
└── data/
```

## Docker

- Single service, port 3000
- Volume: `./data:/app/data`
- Env vars for secret paths
- `restart: unless-stopped`

## Tech

- Node.js + Express
- better-sqlite3
- Vanilla HTML/CSS/JS
