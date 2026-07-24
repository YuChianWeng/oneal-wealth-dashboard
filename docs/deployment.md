# Deployment Guide

This document covers the private, localhost-only production deployment of the
Oneal Wealth Dashboard using Docker Compose.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2+
- The source-data paths exported in your shell (see below)

## Quickstart

```bash
# 1. Set paths to your data sources and the host market snapshot directory
export FINANCE_DATA_DIR=/home/ubuntu/data/finance
export OBSIDIAN_VAULT_PATH=/home/ubuntu/ObsidianVault
export MARKET_DATA_DIR=/home/ubuntu/data/market

# The host producer must be enabled separately:
systemctl --user enable --now wealth-market-snapshot.timer

# 2. Build the image
docker compose build

# 3. Start the container in the background
docker compose up -d

# 4. Verify it is healthy
curl -fsS http://127.0.0.1:3003/api/health
# → {"version":1,"data":{"status":"ok","timestamp":"…"}}

# 5. (Optional) check the homepage returns HTTP 200
curl -I http://127.0.0.1:3003/
```

## Managing the container

| Action               | Command                         |
| -------------------- | ------------------------------- |
| View logs            | `docker compose logs`           |
| Tail recent logs     | `docker compose logs --tail 50` |
| Follow logs          | `docker compose logs -f`        |
| Restart              | `docker compose restart`        |
| Stop                 | `docker compose stop`           |
| Stop & remove        | `docker compose down`           |
| Rebuild after change | `docker compose up -d --build`  |

## Environment-variable reference

These variables are consumed by the Next.js runtime inside the container.

| Variable               | Required | Default                                    | Description                                                                |
| ---------------------- | -------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `PORT`                 | No       | `3003`                                     | Port the Next.js server listens on                                         |
| `NODE_ENV`             | No       | `production`                               | Node environment                                                           |
| `APP_TIMEZONE`         | No       | `Asia/Taipei`                              | Timezone for date rendering                                                |
| `APP_ORIGIN`           | No       | `http://127.0.0.1:3003`                    | Canonical origin for the app                                               |
| `FINANCE_DATA_DIR`     | Yes      | `/home/ubuntu/data/finance`                | Host directory containing finance.db and SQLite WAL files                  |
| `FINANCE_DB_PATH`      | No       | `/data/finance/finance.db`                 | SQLite path inside the container                                           |
| `OBSIDIAN_VAULT_PATH`  | Yes      | –                                          | Host path to the Obsidian vault root                                       |
| `MARKET_DATA_DIR`      | Yes      | `/home/ubuntu/data/market`                 | Host directory containing the atomic one-minute snapshot and daily history |
| `MARKET_SNAPSHOT_PATH` | No       | `/data/market/wealth-market-snapshot.json` | Latest snapshot path inside the container                                  |
| `MARKET_HISTORY_DIR`   | No       | `/data/market/history`                     | Day-session history directory inside the container                         |

Set non‑secret values in `docker-compose.yml` directly. For secret values
add an `.env.production` file:

```bash
# .env.production (git‑ignored)
SOME_SECRET=value
```

## Market data read models

The host-side `wealth-market-snapshot.timer` runs once per minute. The producer writes:

- `/home/ubuntu/data/market/wealth-market-snapshot.json` — latest stock, TAIEX, and TXF quote, including night-session TXF.
- `/home/ubuntu/data/market/history/YYYY-MM-DD.json` — atomic TAIEX (`09:00–13:30`) and TXF (`08:45–13:45`) points collected only during the day session for the Portfolio line chart.

The container mounts `/data/market` read-only. The Portfolio page consumes:

- `GET /api/market/snapshot` — current ticker data.
- `GET /api/market/intraday` — today's day-session line-chart data.

A new trading day starts a new history file. Night-session quotes are not appended to the day-session history, so the chart always begins at the morning session rather than joining unrelated sessions.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Docker host                                     │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  container (oneal-wealth-dashboard)      │    │
│  │                                          │    │
│  │  Next.js server :3003                    │    │
│  │       │                                  │    │
│  │       ├── /data/finance.db  (ro bind)    │    │
│  │       ├── /data/obsidian/   (ro bind)    │    │
│  │       └── /data/market/     (ro bind)    │    │
│  └──────────────┬───────────────────────────┘    │
│                 │ 127.0.0.1:3003                 │
│  ┌──────────────▼───────────────────────────┐    │
│  │  Cloudflare Tunnel (cloudflared)         │    │
│  │  → wealth.onealweng.com                  │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

> The container port is bound to `127.0.0.1` only. It is unreachable from
> the LAN or internet without a local tunnel agent.
