# Deployment Guide

This document covers the private, localhost-only production deployment of the
Oneal Wealth Dashboard using Docker Compose.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2+
- The source-data paths exported in your shell (see below)

## Quickstart

```bash
# 1. Set paths to your data sources
export FINANCE_DB_PATH=/path/to/your/finance.db
export OBSIDIAN_VAULT_PATH=/path/to/your/obsidian/vault

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

| Variable              | Required | Default                    | Description                                   |
| --------------------- | -------- | -------------------------- | --------------------------------------------- |
| `PORT`                | No       | `3003`                     | Port the Next.js server listens on            |
| `NODE_ENV`            | No       | `production`               | Node environment                              |
| `APP_TIMEZONE`        | No       | `Asia/Taipei`              | Timezone for date rendering                   |
| `APP_ORIGIN`          | No       | `http://127.0.0.1:3003`    | Canonical origin for the app                  |
| `FINANCE_DB_PATH`     | Yes      | –                          | Path to the SQLite finance database (read‑only inside container) |
| `OBSIDIAN_VAULT_PATH` | Yes      | –                          | Path to the Obsidian vault root (read‑only inside container) |

Set non‑secret values in `docker-compose.yml` directly.  For secret values
add an `.env.production` file:

```bash
# .env.production (git‑ignored)
SOME_SECRET=value
```

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
│  │       └── /data/obsidian/   (ro bind)    │    │
│  └──────────────┬───────────────────────────┘    │
│                 │ 127.0.0.1:3003                 │
│  ┌──────────────▼───────────────────────────┐    │
│  │  Cloudflare Tunnel (cloudflared)         │    │
│  │  → wealth.onealweng.com                  │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

> The container port is bound to `127.0.0.1` only.  It is unreachable from
> the LAN or internet without a local tunnel agent.
