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

The dashboard is strictly read-only. The market display appears only on the
Investment Portfolio page. Its live ticker reads an atomic one-minute snapshot
produced on the host by `wealth-market-snapshot.timer`; the Portfolio page also
reads a producer-owned `YYYY-MM-DD.json` day-session history for the TAIEX/TXF
line chart. The KGI credential stays on the host and is never sent to the
browser or mounted into the dashboard container. Night-session TXF remains
available in the live ticker but is intentionally not appended to the day-session
chart.

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
- `FINANCE_DATA_DIR`
- `OBSIDIAN_VAULT_PATH`
- `MARKET_DATA_DIR`
- `MARKET_SNAPSHOT_PATH` (container path, set by Compose)
- `MARKET_HISTORY_DIR` (container directory, set by Compose)
- `APP_TIMEZONE`
- `APP_ORIGIN`
- `PORT`

All of these variables are consumed by the read-only runtime or Compose mount configuration; no browser-side provider credential is required.

## Production deployment (Docker + Cloudflare Tunnel)

The dashboard is packaged for private, localhost-only production deployment.
See **[docs/deployment.md](docs/deployment.md)** for full instructions.

### Quickstart

```bash
# Set paths to your data
export FINANCE_DATA_DIR=/home/ubuntu/data/finance
export OBSIDIAN_VAULT_PATH=/home/ubuntu/ObsidianVault
export MARKET_DATA_DIR=/home/ubuntu/data/market

# Build and start
docker compose build
docker compose up -d

# Verify
curl -fsS http://127.0.0.1:3003/api/health
```

The dashboard is bound to `127.0.0.1:3003` only. Expose it via
[Cloudflare Tunnel](docs/cloudflare-access-handoff.md) with
[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/)
as the sole authentication gate — the app itself has no login.
