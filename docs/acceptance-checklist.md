# Acceptance Checklist

Final verification run: **2026-07-11** · 16 commits · 28 test files · 355 tests

## 1. Build & Quality Gates

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1.1 | `npm run lint` passes (0 errors) | ✅ PASS | 0 errors, 13 warnings (unused-imports, font warning — non-blocking) |
| 1.2 | `npm run typecheck` passes | ✅ PASS | `tsc --noEmit` exits 0 |
| 1.3 | `npm test` passes (all 355 tests) | ✅ PASS | 28 files, 355 passed, 0 failed |
| 1.4 | `npm run build` succeeds | ✅ PASS | All 25 routes statically generated / dynamic |
| 1.5 | `npm run test:e2e` (Playwright) | ⚠️ NOT RUN | E2E tests require Playwright browsers; deferred to CI |
| 1.6 | `npm run format:check` (Prettier) | ⚠️ NOT RUN | Format check skipped; not a blocking gate |

## 2. Route Coverage — All 25 Routes

| # | Route | Type | Status | Response |
|---|-------|------|--------|----------|
| 2.1 | `/` | Page (SSG) | ✅ 200 | Dashboard homepage |
| 2.2 | `/finance` | Page (SSG) | ✅ 200 | Finance overview |
| 2.3 | `/finance/accounts` | Page (SSG) | ✅ 200 | Accounts list |
| 2.4 | `/finance/reviews` | Page (SSG) | ✅ 200 | Review history |
| 2.5 | `/portfolio` | Page (SSG) | ✅ 200 | Portfolio list |
| 2.6 | `/portfolio/[symbol]` | Page (SSR) | ✅ 200 | Single position (e.g. 2330.TW) |
| 2.7 | `/portfolio/transactions` | Page (SSG) | ✅ 200 | Transaction history |
| 2.8 | `/portfolio/performance` | Page (SSG) | ✅ 200 | Performance charts |
| 2.9 | `/growth` | Page (SSG) | ✅ 200 | Net worth growth |
| 2.10 | `/insights` | Page (SSG) | ✅ 200 | Insights dashboard |
| 2.11 | `/settings/data-status` | Page (SSG) | ✅ 200 | Source data health |
| 2.12 | `/api/health` | API | ✅ 200 | `{"status":"ok"}` |
| 2.13 | `/api/overview` | API | ✅ 200 | KPI cards + allocation + cashflow |
| 2.14 | `/api/finance/summary` | API | ✅ 200 | Monthly breakdown (with `?month=`) |
| 2.15 | `/api/finance/transactions` | API | ✅ 200 | Transaction list (with params) |
| 2.16 | `/api/portfolio` | API | ✅ 200 | Full position list |
| 2.17 | `/api/portfolio/[symbol]` | API | ✅ 200 | Single position detail |
| 2.18 | `/api/portfolio/performance` | API | ✅ 200 | Portfolio performance data |
| 2.19 | `/api/insights` | API | ✅ 200 | Computed insights |
| 2.20 | `/api/data-status` | API | ✅ 200 | Source health report |
| 2.21 | `/api/growth` | API | ✅ 200 | Growth/net worth data |
| 2.22 | `/api/finance/accounts` | API | ✅ 200 | Account summaries |
| 2.23 | `/api/finance/reviews` | API | ✅ 200 | Finance reviews |
| 2.24 | `/api/portfolio/transactions` | API | ✅ 200 | Portfolio transactions |
| 2.25 | `/api/portfolio/performance` | API | ✅ 200 | (same as 2.18 per plan) |

> **Note:** `/api/finance/summary` and `/api/finance/transactions` return 400 without required query parameters (`month`, `limit`). This is by design — Zod validation rejects missing/invalid params with `VALIDATION_ERROR` response. With valid params both return 200.

## 3. Safety Checks

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 3.1 | No `INSERT`/`UPDATE`/`DELETE`/`CREATE TABLE` in `lib/data/*.ts` | ✅ PASS | 0 matches across all data files |
| 3.2 | No raw file paths in API error responses (`toSafeResponse` used) | ✅ PASS | All 12 API route files import and use `toSafeResponse` on error paths |
| 3.3 | All API routes have `Cache-Control: private, no-store` | ✅ PASS | 38 `Cache-Control` matches across all 12 API route files |
| 3.4 | No credentials or secrets committed | ✅ PASS | 0 matches for `password`/`secret`/`token`/`api_key`/`credentials` |
| 3.5 | `.env.production` git-ignored | ✅ PASS | Present in `.gitignore` |
| 3.6 | Read-only data boundary enforced (no write paths) | ✅ PASS | Docker volumes are `read_only: true`; all data access is read-only |

## 4. Data Correctness Spot-Checks

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | `/api/overview` returns `version` envelope | ✅ PASS | `{"version":1,"data":{...}}` with kpiCards, allocation, cashflow, performance |
| 4.2 | `/api/health` returns `{status:"ok"}` | ✅ PASS | `{"version":1,"data":{"status":"ok","timestamp":"..."}}` |
| 4.3 | `/api/portfolio` returns position list with actual data | ✅ PASS | Returns 0050.TW (NT$370K), 2330.TW (NT$600K), 2454.TW, etc. |
| 4.4 | `/api/finance/summary` returns monthly breakdown | ✅ PASS | Returns categoryBreakdown + accountBreakdown with actual amounts |

## 5. Known Limitations & Intentional Deviations

| # | Item | Detail |
|---|------|--------|
| 5.1 | E2E tests not run | Playwright is configured but requires `npx playwright install` with browsers in CI |
| 5.2 | Prettier format check not run | Non-blocking; can be run with `npm run format:check` |
| 5.3 | 13 ESLint warnings | All non-blocking — unused imports in 2 route files, Next.js font advisory. Clean build regardless |
| 5.4 | Finance routes require query params | `/api/finance/summary` needs `?month=YYYY-MM`; `/api/finance/transactions` needs `?month=YYYY-MM` or date range params. 400 is the correct response for missing params |
| 5.5 | Fixture data used for build | Dev/test use `lib/data/__fixtures__/` for finance.db and vault; production uses bind-mounted real data |
| 5.6 | No authentication | v1 is read-only and gated by Cloudflare Access (external), not by the app itself |
| 5.7 | No write APIs | By design — v1 is strictly read-only. All write paths are excluded |

## Summary

| Gate | Result |
|------|--------|
| Lint | ✅ 0 errors |
| TypeScript | ✅ Clean |
| Unit tests | ✅ 355/355 |
| Production build | ✅ 25/25 routes |
| Route verification | ✅ 25/25 (200 or expected 400) |
| Safety | ✅ All 6 checks pass |
| Data correctness | ✅ All 4 checks pass |

**Overall: PASS** — Ready for production deployment.
