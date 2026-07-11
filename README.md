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
