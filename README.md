# Oneal Wealth Dashboard

A Next.js App Router dashboard for viewing personal wealth information.

## v1 data boundary: strict read-only

This v1 is **strictly read-only**. It must not expose browser or server write paths to any of the following:

- Finance SQLite data
- Obsidian vault data
- Trade or position records

Future data access must preserve this boundary: source data may be read for presentation only; no inserts, updates, deletes, migrations, file writes, or mutation endpoints are permitted in v1.

## Setup

```bash
cp .env.example .env.local
npm ci
npm run dev
```

The values in `.env.example` are reserved for future configuration and are not read by the current bootstrap. In particular, `FINANCE_DB_PATH` and `OBSIDIAN_VAULT_PATH` remain optional placeholders; this task does not read either source.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run format:check
```

## Environment variables

See [`.env.example`](.env.example). It contains only non-secret configuration values:

- `FINANCE_DB_PATH`
- `OBSIDIAN_VAULT_PATH`
- `APP_TIMEZONE`
- `APP_ORIGIN`
- `PORT`

All of these variables are currently reserved for future data and deployment configuration; the bootstrap application does not consume them yet.

## Production deployment (Docker + Cloudflare Tunnel)

The dashboard is packaged for private, localhost-only production deployment.
See **[docs/deployment.md](docs/deployment.md)** for full instructions.

### Quickstart

```bash
# Set paths to your data
export FINANCE_DB_PATH=/path/to/finance.db
export OBSIDIAN_VAULT_PATH=/path/to/obsidian/vault

# Build and start
docker compose build
docker compose up -d

# Verify
curl -fsS http://127.0.0.1:3000/api/health
```

The dashboard is bound to `127.0.0.1:3000` only.  Expose it via
[Cloudflare Tunnel](docs/cloudflare-access-handoff.md) with
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)
as the sole authentication gate — the app itself has no login.
