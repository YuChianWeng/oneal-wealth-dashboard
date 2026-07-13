# Wealth Dashboard Three-Phase Roadmap Implementation Plan

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. Complete and verify one checkpoint before starting the next; do not batch all three phases into one deployment.

**Goal:** Turn Oneal Wealth Dashboard from a read-only reporting surface into a trustworthy, decision-oriented, forward-looking personal finance system across three independently deployable phases.

**Architecture:** Preserve the current read-only Next.js boundary: the production app reads typed, allowlisted data from Finance SQLite and the Obsidian vault but never writes to either. Deterministic Python producers run outside the web request path, write auditable snapshots, and are versioned in this repository with Hermes cron paths symlinked to the repository copies. Every calculation is implemented as a pure function behind strict Zod view-model schemas, then exposed through private/no-store API routes and rendered with explicit source dates and audit breakdowns.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Zod 4, better-sqlite3, Recharts, SWR, Vitest, Testing Library, Playwright, Python 3.11, PyYAML, yfinance producer jobs, Obsidian Markdown/frontmatter, Docker Compose, Cloudflare Access, Hermes cron.

---

## 1. Scope and sequencing

### Phase 1 — Trustworthy numbers

Build:

1. Investment reconciliation center.
2. Per-component freshness and unsettled cash visibility.
3. Policy-loan performance net of attributable financing cost.
4. 0050 total-return benchmark as the primary benchmark, with TAIEX retained as secondary.
5. Reconciliation and freshness Insights.

**Phase 1 exit condition:** Every policy-loan strategy value can be decomposed into confirmed cash, unsettled receivables/payables, holdings market value, financing cost, and benchmark values, with dates and deterministic warnings.

### Phase 2 — Better decisions

Build:

1. Realized/unrealized PnL and fee/tax accounting.
2. Return attribution by stock, sector, industry, theme, and portfolio role.
3. TWR/Modified Dietz plus money-weighted return/XIRR.
4. Research decision queue.
5. Deduplicated Telegram alerts for action-needed conditions.

**Phase 2 exit condition:** Oneal can answer “what made or lost money, why do I still hold it, what needs review, and what action is required?” without manually reconciling several pages.

### Phase 3 — Forward planning

Build:

1. Budget versus actual.
2. Recurring expense detection and 30/60/90-day cash-flow forecast.
3. Configurable financial goals and ETA projections.
4. Read-only what-if scenarios.
5. Monthly review/export package.

**Phase 3 exit condition:** The dashboard can project likely cash availability and goal progress while keeping assumptions explicit and avoiding automatic financial actions.

---

## 2. Global constraints and invariants

1. **Read-only production app:** no POST/PUT/DELETE routes for Finance, Obsidian, trades, budgets, or goals in this roadmap.
2. **No client-side raw data access:** raw SQLite rows, vault paths, Markdown bodies, and file-system errors stay server-side.
3. **Private responses:** every new API route returns `Cache-Control: private, no-store`.
4. **Asia/Taipei semantics:** trade dates, settlement checks, budget months, and alert dates use explicit Asia/Taipei rules.
5. **No fake precision:** missing financing baseline, dividend symbol, benchmark observation, or account freshness must produce `null`/warning status, not an inferred zero.
6. **No double counting:** a trade may affect holdings, pending settlement cash, realized PnL, and TWR cash-flow adjustment, but each view must document its own accounting boundary.
7. **Source dates are first-class:** account balance date, price date, trade date, benchmark date, policy valuation date, and generated-at timestamp must not be collapsed into one generic “updated” field.
8. **Backward-compatible snapshots:** old frontmatter without new fields remains readable and is marked partial rather than rejected.
9. **Deterministic analytics:** same source fixtures plus same `now` produce identical outputs and stable insight IDs.
10. **No deployment coupling:** each checkpoint is commit-ready and each phase is deployable and rollback-safe on its own.

---

## 3. Current baseline

- Production service: `oneal-wealth-dashboard` on `127.0.0.1:3003`, behind Cloudflare Access.
- Finance and Obsidian mounts are read-only inside Docker.
- Current test baseline: 404 Vitest tests passing.
- Current portfolio performance: chain-linked Modified Dietz, aggregate TAIEX benchmark, maximum drawdown, win rate, and cash-flow audit.
- Current policy-loan snapshot producer: `scripts/loan_investment_snapshot.py`.
- Hermes producer path: `/home/ubuntu/.hermes/scripts/loan_investment_snapshot.py` symlinked to the repository copy.
- Current policy fields already expose principal, accrued interest, daily adjustment, rate, total deduction, valuation date, and next due date through `lib/data/insurance-policy-repository.ts`.
- Current loan-investment snapshot includes confirmed cash, cash as-of date, unsettled trade adjustment/count, effective cash value, holdings market value, strategy value, and TAIEX.
- Current Research view exposes thesis, catalysts, risks, invalidation, next step, source checked date, and last updated date.
- Current Finance view has historical transactions and balances, but no budget/forecast/goal model.

---

# Phase 1 — Trustworthy numbers

## Phase 1 first implementation slice

### Smallest useful slice: Investment reconciliation center

Build only:

- Pure unsettled-cash and reconciliation calculation.
- Strict reconciliation API contract.
- `/portfolio/reconciliation` page.
- Navigation entry.
- Tests for buy, sell, same-day, stale cash, missing cashflow, and no-trade states.
- A compact reconciliation summary on `/growth`.

Explicitly out of scope for this first slice:

- Financing-cost deduction.
- 0050 benchmark.
- Telegram notifications.
- Realized PnL attribution.
- Budget or goals.
- Any write operation.

**Why first:** it directly prevents a repeat of the 2026-07-13 sale/cash timing bug and creates the common audit model needed by later work.

---

## Task 1.1: Freeze the reconciliation contract with fixtures

**Objective:** Define exactly how confirmed cash, pending trade cash, holdings value, and strategy NAV relate before adding UI code.

**Files:**

- Create: `lib/schemas/reconciliation.ts`
- Create: `lib/analytics/cash-reconciliation.ts`
- Create: `tests/unit/schemas/reconciliation.test.ts`
- Create: `tests/unit/analytics/cash-reconciliation.test.ts`
- Create fixtures under: `lib/data/__fixtures__/vault/Finance/Entries/`
- Create fixtures under: `lib/data/__fixtures__/vault/Trading/Portfolio/Transactions/`
- Create fixtures under: `lib/data/__fixtures__/vault/Trading/Portfolio/Snapshots/`

**Contract:**

```ts
export interface PendingSettlement {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  tradeDate: string;
  settlementDate: string | null;
  netCashflow: number;
  effectiveCashAdjustment: number;
  ageTradingDays: number;
  status: "pending" | "overdue" | "covered-by-cash-snapshot";
}

export interface InvestmentReconciliation {
  valuationDate: string;
  confirmedCash: number;
  cashAsOfDate: string;
  pendingTradeCashAdjustment: number;
  effectiveCashValue: number;
  holdingsMarketValue: number;
  strategyValue: number;
  pendingSettlements: PendingSettlement[];
  status: "reconciled" | "attention" | "unavailable";
  warnings: string[];
}
```

**TDD steps:**

1. Add a failing test for the real regression shape: cash `44,847` as of `2026-07-12`, sell net cashflow `+8,743` on `2026-07-13`, holdings `149,145.70`; expect effective cash `53,590` and strategy value `202,735.70`.
2. Run: `npm test -- tests/unit/analytics/cash-reconciliation.test.ts`
3. Expected: FAIL because the module/schema does not exist.
4. Implement the minimal pure function.
5. Add tests for:
   - buy after cash date becomes payable;
   - sell after cash date becomes receivable;
   - a cash snapshot on/after trade date clears the pending adjustment;
   - missing/invalid `netCashflow` creates a warning and never silently counts as zero;
   - invalid date does not enter arithmetic;
   - multiple trades aggregate deterministically;
   - zero holdings remains valid after complete liquidation;
   - same inputs generate stable ordering and warnings.
6. Run the two new test files; expected PASS.
7. Commit:

```bash
git add lib/schemas/reconciliation.ts lib/analytics/cash-reconciliation.ts \
  tests/unit/schemas/reconciliation.test.ts \
  tests/unit/analytics/cash-reconciliation.test.ts \
  lib/data/__fixtures__/vault

git commit -m "test: define investment reconciliation contract"
```

**Checkpoint 1A:**

- Input: fixture cash, transactions, holdings.
- Output: strict `InvestmentReconciliation` object.
- Validation: unit tests only; no production source reads.
- Success: all arithmetic and warning cases pass.
- Stop point: if trade sign or settlement semantics are ambiguous, do not build the repository until fixtures are corrected.

---

## Task 1.2: Build the read-only reconciliation repository

**Objective:** Assemble the pure contract from allowlisted Obsidian sources without exposing raw notes.

**Files:**

- Create: `lib/data/reconciliation-repository.ts`
- Modify: `lib/data/portfolio-repository.ts`
- Modify: `lib/data/vault-reader.ts` only if an additional allowlisted directory helper is required
- Test: `tests/unit/data/reconciliation-repository.test.ts`

**Approach:**

1. Read the latest valid balance entry on/before valuation date.
2. Read valid transaction notes after `cashAsOfDate` and on/before valuation date.
3. Read the same-day portfolio snapshot; if absent, use the latest snapshot on/before valuation date and expose its date explicitly.
4. Validate source shapes before calculation.
5. Return `Result<InvestmentReconciliation, SourceError>`.
6. Never return source paths or raw frontmatter.

**TDD steps:**

1. Write repository tests against `lib/data/__fixtures__/vault`.
2. Verify failure before implementation.
3. Implement minimum source adapters and mapping.
4. Add partial-data tests: no balance, no snapshot, invalid transaction note, duplicate trade note, closed portfolio.
5. Run:

```bash
npm test -- tests/unit/data/reconciliation-repository.test.ts
```

6. Expected: PASS with safe `SourceError` codes.
7. Commit: `feat: add investment reconciliation repository`.

**Checkpoint 1B:**

- Input: fixture vault.
- Output: repository view model.
- Validation: fixture-based test plus path-leak assertion.
- Success: missing sources degrade safely and no absolute path appears.
- Stop point: if the latest Finance note date is not the true Cathay cash date, extend the balance producer to persist per-account as-of metadata before proceeding.

---

## Task 1.3: Add the reconciliation API

**Objective:** Provide one private, strict endpoint for the reconciliation page and Insights.

**Files:**

- Create: `app/api/portfolio/reconciliation/route.ts`
- Create: `tests/unit/api/portfolio-reconciliation.test.ts`

**Endpoint:**

```text
GET /api/portfolio/reconciliation?date=YYYY-MM-DD
```

Rules:

- Omitted date defaults to current Asia/Taipei date.
- Future date and malformed date return HTTP 400.
- Source unavailability returns safe HTTP 500 contract.
- Response is `{ version: 1, data }`.
- Header is `Cache-Control: private, no-store`.

**TDD steps:** validation failure → happy-path contract → source failure → path-leak test.

**Verification:**

```bash
npm test -- tests/unit/api/portfolio-reconciliation.test.ts
```

**Commit:** `feat: expose portfolio reconciliation API`.

---

## Task 1.4: Build `/portfolio/reconciliation`

**Objective:** Make every investment NAV component visible and auditable.

**Files:**

- Create: `app/portfolio/reconciliation/page.tsx`
- Create: `app/portfolio/reconciliation/reconciliation-page.tsx`
- Create: `components/portfolio/reconciliation-summary.tsx`
- Create: `tests/unit/components/reconciliation-summary.test.tsx`
- Modify: `lib/nav-sections.ts`

**UI sections:**

1. Reconciliation status badge.
2. Confirmed Cathay cash and as-of date.
3. Pending buy payables and sell receivables.
4. Effective cash value.
5. Holdings market value and snapshot date.
6. Strategy NAV equation.
7. Pending settlement table.
8. Warning/action list.
9. Explicit note that pending cash is an NAV receivable/payable and does not overwrite Finance balances.

**Responsive requirements:**

- Mobile cards for equations and warnings.
- Horizontally scrollable settlement table.
- Amounts use `font-mono-dashboard` and existing TWD formatter.
- Do not use red for ordinary pending settlements; red is reserved for overdue/inconsistent states.

**Validation:**

```bash
npm test -- tests/unit/components/reconciliation-summary.test.tsx
npm run typecheck
npm run lint
```

**Manual checkpoint:** compare the UI equation to the source snapshot values for one known day; all terms must add exactly.

**Commit:** `feat: add investment reconciliation dashboard`.

---

## Task 1.5: Expose reconciliation details on the Growth card

**Objective:** Show that the policy-loan return includes pending trade cash instead of hiding the adjustment in the producer note.

**Files:**

- Modify: `lib/data/loan-investment-repository.ts`
- Modify: `app/api/growth/route.ts`
- Modify: `app/growth/growth-page.tsx`
- Create or modify: `tests/unit/data/loan-investment-repository.test.ts`
- Modify: `tests/unit/api/growth.test.ts` if created; otherwise create it

**Extend each latest point with:**

```ts
confirmedCash: number | null;
pendingTradeCashAdjustment: number;
pendingTradeCount: number;
effectiveCashValue: number | null;
holdingsMarketValue: number | null;
```

Backward compatibility:

- Old snapshots missing fields map to `null` plus a `partialAudit` flag.
- Existing strategy value/return remains readable.

**UI:** Add a collapsible/static audit row under the latest policy-loan KPI card; do not crowd every chart tooltip with all audit fields.

**Validation:** repository fixture tests, API contract test, component render test.

**Commit:** `feat: show loan investment cash reconciliation`.

---

## Task 1.6: Define attributable financing-cost semantics

**Objective:** Avoid calling gross asset return “net performance” until the interest baseline is explicit.

**Files:**

- Modify source contract documentation: `docs/operations.md`
- Modify schema: `lib/schemas/finance.ts`
- Modify repository: `lib/data/insurance-policy-repository.ts`
- Add tests: `tests/unit/data/insurance-policy-repository.test.ts`
- Planned source note change: `Finance/Insurance/Policies/SavingsPolicy_2011.md` only after explicit review during execution

**Required source fields:**

```yaml
loan_investment_interest_baseline_date: 2026-06-20
loan_investment_interest_baseline_amount: <confirmed amount>
```

**Formula:**

```text
attributable financing cost
= interest payments recorded since strategy start
+ current accrued interest
+ current estimated daily adjustment
- interest baseline amount
```

Rules:

- Never subtract the NT$200,000 principal twice.
- Never include interest accrued before the strategy baseline.
- If linked interest payments cannot be identified safely, return `financingCostStatus: needs-review` instead of estimating them.
- Keep policy net surrender value accounting separate; this metric measures strategy economics, not net-worth deduction.

**Decision checkpoint 1C:** review the exact baseline date/amount with Oneal before any policy-note write. The code may be prepared and tested with fixtures first, but production net return must remain hidden/partial until baseline data is confirmed.

---

## Task 1.7: Implement gross and net policy-loan performance

**Objective:** Display investment return before and after financing cost.

**Files:**

- Create: `lib/analytics/loan-investment-performance.ts`
- Create: `tests/unit/analytics/loan-investment-performance.test.ts`
- Modify: `lib/data/loan-investment-repository.ts`
- Modify: `app/api/growth/route.ts`
- Modify: `app/growth/growth-page.tsx`

**View model:**

```ts
interface LoanInvestmentEconomics {
  grossStrategyValue: number;
  grossReturnPct: number;
  financingCost: number | null;
  netStrategyValue: number | null;
  netReturnPct: number | null;
  annualLoanRate: number;
  breakEvenAnnualReturnPct: number | null;
  costAsOfDate: string | null;
  status: "confirmed" | "partial" | "needs-review";
}
```

**Tests:**

- Zero financing cost.
- Confirmed baseline.
- Interest payment plus current accrual.
- Accrual below baseline.
- Missing baseline.
- Negative/invalid values rejected.
- No double subtraction of principal.

**UI:** show “毛報酬” and “扣息後淨報酬” side by side; partial values use `—` plus a reason, never a guessed number.

**Commit:** `feat: add net financing cost to loan performance`.

---

## Task 1.8: Add a versioned benchmark-series producer

**Objective:** Make 0050 adjusted total return the primary benchmark without network access inside Next.js.

**Files:**

- Create: `scripts/update_benchmark_series.py`
- Create: `scripts/test_update_benchmark_series.py`
- Create: `lib/data/benchmark-repository.ts`
- Create: `lib/schemas/benchmark.ts`
- Create fixture: `lib/data/__fixtures__/vault/Trading/Portfolio/Benchmarks/0050.TW.json`
- Create fixture: `lib/data/__fixtures__/vault/Trading/Portfolio/Benchmarks/^TWII.json`
- Modify during rollout: `/home/ubuntu/.hermes/scripts/daily_growth_snapshots.py` to call the repository script through a symlinked/versioned path

**Producer contract:**

```json
{
  "version": 1,
  "symbol": "0050.TW",
  "basis": "adjusted-close-total-return-proxy",
  "currency": "TWD",
  "fetchedAt": "ISO timestamp with +08:00",
  "points": [{ "date": "YYYY-MM-DD", "close": 0, "adjustedClose": 0 }]
}
```

**Important design choice:** refresh the complete historical adjusted-close series instead of appending one daily adjusted value. Corporate actions/dividends can retroactively change adjusted history; storing isolated point-in-time adjusted values would produce a discontinuous total-return index.

**Safety:** write to a temporary file, validate JSON and monotonic dates, then atomically replace the output. Empty/partial provider responses must not overwrite the last good file.

**Python tests:** provider fixture parsing, duplicate dates, missing adjusted close, atomic-write failure, stale response, Asia/Taipei fetched timestamp.

**Checkpoint 1D:** run producer in dry-run/cache fixture mode first. Compare at least three dates to a second source or manually reviewed yfinance output before enabling cron writes.

---

## Task 1.9: Align portfolio performance against 0050 and TAIEX

**Objective:** Use 0050 total return as primary and retain TAIEX as context.

**Files:**

- Modify: `lib/analytics/types.ts`
- Modify: `lib/analytics/portfolio-performance.ts`
- Modify: `lib/data/portfolio-repository.ts` or compose with `lib/data/benchmark-repository.ts`
- Modify: `app/api/portfolio/performance/route.ts`
- Modify: `app/portfolio/performance/page.tsx`
- Modify: `tests/unit/analytics/portfolio-performance.test.ts`
- Modify: `tests/unit/api/portfolio-performance.test.ts`

**Alignment rule:** for each portfolio observation date, use the latest benchmark point on or before that date; never use a future market date. Expose the benchmark observation date when carried forward.

**API additions:**

```ts
benchmarks: {
  primary: { symbol: "0050.TW"; basis: string; index: number[] };
  secondary: { symbol: "^TWII"; basis: "price-index"; index: number[] };
};
```

**KPI order:**

1. Portfolio return.
2. 0050 total return.
3. Excess return versus 0050.
4. Maximum drawdown.

Move win rate and TAIEX to secondary detail cards.

**Tests:** market holiday carry-forward, missing first benchmark, dividend-adjusted jump, partial benchmark, same-base-date normalization, no future-fill.

**Commit:** `feat: compare portfolio with 0050 total return`.

---

## Task 1.10: Add reconciliation/freshness Insights

**Objective:** Surface trust failures in the existing Insights workflow.

**Files:**

- Modify: `lib/analytics/insights.ts`
- Modify: `app/api/insights/route.ts`
- Modify: `tests/unit/analytics/insights.test.ts`
- Modify: `tests/unit/api/insights.test.ts`

**Rules:**

- Cash balance older than configurable threshold.
- Pending settlement older than T+2 completed TWSE trading days.
- Missing `netCashflow` on a trade.
- Strategy equation mismatch beyond one TWD rounding tolerance.
- Missing/partial financing baseline.
- Missing/stale 0050 benchmark file.

Bump `INSIGHT_VERSION` only once when all new Phase 1 rules are ready.

**Commit:** `feat: add reconciliation integrity insights`.

---

## Phase 1 validation and rollout gate

Run:

```bash
python3 -m unittest -v scripts/test_loan_investment_snapshot.py
python3 -m unittest -v scripts/test_update_benchmark_series.py
npm test
npm run typecheck
npm run lint
npm run build
```

Production-mode probe on a non-production port:

```bash
PORT=3010 npm start -- -p 3010
curl -fsS http://127.0.0.1:3010/api/portfolio/reconciliation
curl -fsS 'http://127.0.0.1:3010/api/portfolio/performance?range=ALL'
curl -fsS http://127.0.0.1:3010/api/growth
```

Privacy checks:

- No `/home/ubuntu` in API payloads.
- No raw Markdown bodies.
- No public bind.
- All new APIs use private/no-store.

Production success criteria:

- `/portfolio/reconciliation` HTTP 200.
- Strategy equation matches snapshot exactly.
- Pending trades visible and not treated as profit/loss.
- Net return is shown only when baseline is confirmed.
- 0050 is primary and no future benchmark date is used.
- Container remains healthy.

Rollback boundary: keep the pre-Phase-1 image tag and previous cron producer symlink targets until one full trading day passes without mismatch.

---

# Phase 2 — Better decisions

## Task 2.1: Extend the trade contract for realized economics

**Objective:** Preserve trade-level realized PnL, fee/tax, settlement, and quality fields already present in transaction notes.

**Files:**

- Modify: `lib/schemas/portfolio.ts`
- Modify: `lib/data/portfolio-repository.ts`
- Modify: `app/api/portfolio/transactions/route.ts`
- Modify: `tests/unit/data/portfolio-repository.test.ts`
- Create/modify: `tests/unit/api/portfolio-transactions.test.ts`

**Add fields:**

```ts
settlementDate: string | null;
realizedPnl: number | null;
feeTax: number;
netCashflow: number | null;
dataQuality: "confirmed" | "estimated" | "needs-review";
```

Do not infer realized PnL when source data is absent. Validate sign conventions against buy/sell fixtures.

**Commit:** `feat: expose realized trade economics`.

---

## Task 2.2: Build realized/unrealized PnL analytics

**Objective:** Answer total PnL by symbol without losing closed positions.

**Files:**

- Create: `lib/analytics/pnl-attribution.ts`
- Create: `tests/unit/analytics/pnl-attribution.test.ts`
- Create: `lib/schemas/attribution.ts`

**Initial formula:**

```text
symbol total PnL
= confirmed realized PnL
+ current unrealized PnL
- fees/taxes not already included in realized PnL
```

The source contract must state whether `realized_pnl` is net or gross. If ambiguous, expose both source value and fee/tax separately and label aggregate `needs-review` rather than subtracting twice.

**First slice limitation:** dividends are excluded until Finance income rows have reliable stock-symbol linkage. Add `dividendsIncluded: false` in audit metadata.

**Tests:** partial sells, full close, multiple buys, zero shares, fee inclusion modes, invalid/estimated PnL.

**Commit:** `feat: compute realized and unrealized pnl attribution`.

---

## Task 2.3: Attribute current and historical performance

**Objective:** Show contributors/detractors by stock and taxonomy dimensions.

**Files:**

- Extend: `lib/analytics/pnl-attribution.ts`
- Modify: `lib/data/stock-taxonomy-repository.ts`
- Create: `app/api/portfolio/attribution/route.ts`
- Create: `tests/unit/api/portfolio-attribution.test.ts`
- Create: `app/portfolio/attribution/page.tsx`
- Create: `app/portfolio/attribution/attribution-page.tsx`
- Modify: `lib/nav-sections.ts`

**Dimensions:** stock, sector, industry, theme, portfolio role.

**Rules:**

- Multi-theme positions must not multiply total PnL. Use explicit allocation policy: primary theme only for additive attribution, while all-theme exposure remains non-additive and labeled.
- Closed positions retain the taxonomy effective at exit when available; otherwise use current research classification plus `classificationStatus: historical-approximation`.
- Sum of additive categories must reconcile to total attributed PnL within rounding tolerance.

**UI:** top contributors, top detractors, realized/unrealized split, fee/tax drag, non-attributed bucket, range selector.

**Commit:** `feat: add portfolio return attribution`.

---

## Task 2.4: Add XIRR/money-weighted return

**Objective:** Separate strategy skill (TWR/Modified Dietz) from Oneal’s actual capital experience (XIRR).

**Files:**

- Create: `lib/analytics/xirr.ts`
- Create: `tests/unit/analytics/xirr.test.ts`
- Modify: `app/api/portfolio/performance/route.ts`
- Modify: `app/portfolio/performance/page.tsx`

**Algorithm:** deterministic bracketed root search with bounded iterations; do not rely on an opaque dependency. Use dated external cash flows plus ending portfolio NAV.

**Rules:**

- Investor contributions are negative XIRR cash flows.
- Investor withdrawals are positive.
- Ending NAV is a positive terminal flow.
- Multiple sign changes that produce ambiguous roots return `status: ambiguous`.
- Insufficient duration/data returns `null` with reason.

**Tests:** known textbook XIRR case, no root, multiple roots, same-day flows, leap year, zero ending NAV.

**UI:** label clearly as “資金加權年化報酬（XIRR）”; keep existing Modified Dietz as “策略時間加權報酬”.

**Commit:** `feat: add money-weighted portfolio return`.

---

## Task 2.5: Define the research decision-queue contract

**Objective:** Convert passive research metadata into a deterministic review queue.

**Files:**

- Modify: `lib/schemas/research.ts`
- Modify: `lib/data/research-repository.ts`
- Create: `lib/analytics/research-queue.ts`
- Create: `tests/unit/analytics/research-queue.test.ts`
- Add fixtures under: `lib/data/__fixtures__/vault/Trading/Stocks/`

**Planned optional frontmatter fields:**

```yaml
next_review: YYYY-MM-DD
next_catalyst_date: YYYY-MM-DD
catalyst_label: string
decision: hold|add|reduce|exit|watch
thesis_status: intact|watch|broken
```

Backward compatibility: derive queue items from `lastUpdated`, `sourceChecked`, `nextStep`, and invalidation when new fields are absent.

**Queue priorities:**

1. Thesis broken.
2. Hard stop breached for leveraged positions.
3. Invalid/missing research.
4. Review overdue.
5. Catalyst due within configurable days.
6. Stale research.
7. Normal hold.

**Tests:** stable ordering, same-day dates, missing fields, duplicate research, timezone boundary.

**Commit:** `feat: add deterministic research review queue`.

---

## Task 2.6: Build the research decision page

**Objective:** Give Oneal one view of what needs review and why.

**Files:**

- Create: `app/api/portfolio/research-queue/route.ts`
- Create: `tests/unit/api/portfolio-research-queue.test.ts`
- Modify: `app/portfolio/research/page.tsx`
- Create: `components/portfolio/research-queue.tsx`
- Create: `tests/unit/components/research-queue.test.tsx`

**UI:** filter by urgency/status, due date, thesis status, next catalyst, next step, drill-through to stock detail. Keep dashboard read-only; edits remain in Obsidian workflows.

**Commit:** `feat: add research decision queue UI`.

---

## Task 2.7: Add event-oriented alert payloads

**Objective:** Make action-needed conditions machine-deliverable without coupling Telegram to API routes.

**Files:**

- Create: `lib/schemas/alerts.ts`
- Create: `lib/analytics/alerts.ts`
- Create: `tests/unit/analytics/alerts.test.ts`
- Create: `app/api/alerts/route.ts`
- Create: `tests/unit/api/alerts.test.ts`

**Alert fields:** stable ID, severity, title, description, action URL, generated date, source rule version, dedupe key.

Only create alerts for actionable events; informational dashboard items remain Insights.

**Commit:** `feat: expose deterministic wealth alerts`.

---

## Task 2.8: Add a deduplicated Telegram alert runner

**Objective:** Deliver only new/changed actionable alerts through Hermes.

**Files:**

- Create: `scripts/wealth_dashboard_alerts.py`
- Create: `scripts/test_wealth_dashboard_alerts.py`
- Runtime state after approval: `/home/ubuntu/.hermes/state/wealth-dashboard-alerts.json`
- Planned cron creation/update only during execution after exact delivery target review

**Runner behavior:**

1. Fetch `http://127.0.0.1:3003/api/alerts`.
2. Validate JSON contract.
3. Compare stable IDs plus content hashes against local state.
4. Print a concise Traditional Chinese message only for new/changed action-needed alerts.
5. Print nothing when there is nothing new, allowing `no_agent=true` silent delivery.
6. Update state atomically only after successful output construction.
7. `--dry-run` never changes state.

**Tests:** first run, duplicate run, changed content, resolved alert, malformed API, empty output, state corruption recovery.

**Checkpoint 2A:** run manually with `--dry-run`; obtain Oneal’s approval of exact message and Telegram target before creating/enabling cron.

**Commit:** `feat: add deduplicated wealth alert runner`.

---

## Phase 2 validation and rollout gate

Run all Phase 1 commands plus:

```bash
python3 -m unittest -v scripts/test_wealth_dashboard_alerts.py
npm test -- tests/unit/analytics/pnl-attribution.test.ts
npm test -- tests/unit/analytics/xirr.test.ts
npm test -- tests/unit/analytics/research-queue.test.ts
npm test
npm run typecheck
npm run lint
npm run build
```

Acceptance checks:

- Realized + unrealized + fee/tax audit reconciles.
- Closed positions remain visible in attribution.
- Taxonomy attribution does not double count multi-theme positions.
- XIRR and TWR are labeled and mathematically distinct.
- Research queue ordering is deterministic.
- Alert runner is silent on a second unchanged run.
- No cron is enabled without reviewed target and message format.

Deploy Phase 2 separately from Phase 1; retain the Phase 1 image rollback tag.

---

# Phase 3 — Forward planning

## Task 3.1: Define a read-only planning source contract

**Objective:** Store budgets/goals as reviewable Obsidian configuration without adding web writes.

**Files:**

- Create: `lib/schemas/planning.ts`
- Create: `lib/data/planning-repository.ts`
- Create: `tests/unit/data/planning-repository.test.ts`
- Create fixtures under: `lib/data/__fixtures__/vault/Finance/Planning/`
- Planned production notes after review:
  - `Finance/Planning/Budget Targets.md`
  - `Finance/Planning/Goals.md`

**Budget example:**

```yaml
type: budget-targets
currency: TWD
default_monthly:
  food: 8000
  transport: 2500
  subscriptions: 1200
```

**Goal example:**

```yaml
type: financial-goals
goals:
  - id: emergency-fund-6m
    name: 緊急預備金 6 個月
    metric: emergency_fund_months
    target: 6
    target_date: 2027-06-30
    status: active
```

Strictly validate known fields; expose safe validation errors and no raw paths.

**Decision checkpoint 3A:** review category-key mappings and goal definitions before writing production notes.

---

## Task 3.2: Implement budget-versus-actual analytics

**Objective:** Compare monthly spending against explicit category targets.

**Files:**

- Create: `lib/analytics/budget.ts`
- Create: `tests/unit/analytics/budget.test.ts`
- Extend: `lib/finance-queries.ts`
- Extend: `lib/data/finance-repository.ts`
- Create: `app/api/finance/budget/route.ts`
- Create: `tests/unit/api/finance-budget.test.ts`

**Metrics:** target, actual, remaining, utilization percent, projected month-end actual, status.

**Projection rule:** use elapsed Asia/Taipei calendar days only after a minimum observation threshold; before that return `projectionStatus: insufficient-data`.

**Tests:** missing category, zero target, overspend, month boundary, leap year, excluded investment bucket.

**Commit:** `feat: add budget versus actual analytics`.

---

## Task 3.3: Build budget UI

**Objective:** Add a focused planning page without turning the app into an editing interface.

**Files:**

- Create: `app/finance/budget/page.tsx`
- Create: `app/finance/budget/budget-page.tsx`
- Create: `components/finance/budget-progress.tsx`
- Create: `tests/unit/components/budget-progress.test.tsx`
- Modify: `lib/nav-sections.ts`

**UI:** overall budget, category progress, projected month-end, previous-month comparison, clear link/text saying targets are maintained in Obsidian.

**Commit:** `feat: add monthly budget dashboard`.

---

## Task 3.4: Detect recurring cash flows conservatively

**Objective:** Identify likely recurring income/expenses from transaction history without falsely declaring one-off payments recurring.

**Files:**

- Create: `lib/analytics/recurring-cashflow.ts`
- Create: `tests/unit/analytics/recurring-cashflow.test.ts`
- Extend: `lib/finance-queries.ts`
- Extend: `lib/data/finance-repository.ts`

**Minimum rule:** require at least three occurrences across at least three distinct months, matching normalized merchant/category/account and amount within a configurable tolerance. Return confidence and evidence dates.

Do not auto-label transactions or write back to Finance DB.

**Tests:** monthly subscription, variable utility bill, duplicate same-day charge, annual payment, insufficient history, merchant spelling normalization.

**Commit:** `feat: detect recurring cash flows`.

---

## Task 3.5: Build the 30/60/90-day cash-flow forecast

**Objective:** Project expected account cash movements with explicit confidence and assumptions.

**Files:**

- Create: `lib/analytics/cashflow-forecast.ts`
- Create: `tests/unit/analytics/cashflow-forecast.test.ts`
- Create: `app/api/finance/forecast/route.ts`
- Create: `tests/unit/api/finance-forecast.test.ts`
- Create: `app/finance/forecast/page.tsx`
- Create: `app/finance/forecast/forecast-page.tsx`

**Inputs:** latest liquid account balances, recurring events, known loan interest dates, budget remainder, pending brokerage settlements.

**Outputs:** projected inflow/outflow/net cash by date bucket, minimum projected cash, confidence, assumptions, missing-source warnings.

**Safety:** never present forecast as a guaranteed balance; render a range when amount variability is material.

**Tests:** payday, subscription, credit-card outflow, pending trade settlement, insufficient data, stale balance, crossing month/year boundaries.

**Commit:** `feat: add cash flow forecast`.

---

## Task 3.6: Implement goal progress and ETA

**Objective:** Track explicit financial goals using current metrics and transparent projections.

**Files:**

- Create: `lib/analytics/goals.ts`
- Create: `tests/unit/analytics/goals.test.ts`
- Create: `app/api/goals/route.ts`
- Create: `tests/unit/api/goals.test.ts`
- Create: `app/goals/page.tsx`
- Create: `app/goals/goals-page.tsx`
- Modify: `lib/nav-sections.ts`

**Supported first-version metrics:** net worth, emergency-fund months, debt balance, investment NAV, monthly savings.

**ETA:** based on an explicit trailing average or user-configured monthly contribution; do not extrapolate from fewer than three complete months. Return `etaStatus` and assumption text.

**Tests:** already achieved, moving backward, zero contribution, missing target date, insufficient history, negative net worth.

**Commit:** `feat: add financial goal tracking`.

---

## Task 3.7: Add a pure read-only scenario engine

**Objective:** Let Oneal compare choices without modifying portfolio or Finance sources.

**Files:**

- Create: `lib/analytics/scenarios.ts`
- Create: `tests/unit/analytics/scenarios.test.ts`
- Create: `app/scenarios/page.tsx`
- Create: `app/scenarios/scenario-page.tsx`
- Optionally create: `app/api/scenarios/route.ts` only if server-only source data is required

**First scenarios:**

1. Sell/reduce a position and show post-trade stock/sector/theme/role concentration.
2. Repay policy-loan principal and show interest-cost and liquidity impact.
3. Change monthly contribution and show goal ETA.
4. Apply a portfolio drawdown and show net-worth/debt-ratio impact.

**Rules:** scenario state lives only in the browser/session; no trade execution, no Finance writes, no persisted recommendation.

**Tests:** conservation of value, fees/tax assumptions, no negative shares, multi-theme non-additive warning, loan repayment cannot exceed available cash.

**Commit:** `feat: add read-only financial scenarios`.

---

## Task 3.8: Generate a monthly review package

**Objective:** Produce a durable, privacy-safe monthly summary for review/export.

**Files:**

- Create: `lib/analytics/monthly-review.ts`
- Create: `tests/unit/analytics/monthly-review.test.ts`
- Create: `app/api/reports/monthly/route.ts`
- Create: `tests/unit/api/monthly-report.test.ts`
- Create: `app/reports/monthly/page.tsx`
- Optional later producer: `scripts/monthly_review_export.py`

**Report sections:** income/expense, budget variance, net-worth change, portfolio TWR/XIRR, realized/unrealized PnL, 0050 excess return, financing cost, goal progress, action-needed Insights, data-quality caveats.

Start with HTML/print CSS. PDF/Obsidian export is out of scope until the on-screen report is validated.

**Commit:** `feat: add monthly financial review report`.

---

## Phase 3 validation and rollout gate

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Acceptance checks:

- Budget totals reconcile to Finance monthly totals excluding investment bucket.
- Forecast shows confidence and stale-source warnings.
- Recurring detection requires sufficient history.
- Goal ETA never appears with insufficient data.
- Scenario calculations preserve accounting identities.
- No scenario or planning page writes to Finance/Obsidian.
- Monthly review includes provenance dates and caveats.

Deploy Phase 3 only after Phase 2 has one stable monthly close, because forecast and review quality depend on the attribution and reconciliation layers.

---

# 4. Cross-phase UI and maintenance cleanup

Perform these in small commits alongside the first relevant phase:

1. Rename `stubNavSections` to `navSections` in `lib/nav-sections.ts` and all imports.
2. Remove duplicate “財務健康” navigation entry pointing to `/growth`, or create a dedicated anchor/route.
3. Standardize user-facing language: Traditional Chinese labels, with technical acronyms explained once.
4. Update `README.md` from bootstrap/port-3000 assumptions to the actual read-only production architecture.
5. Update `docs/acceptance-checklist.md` to avoid hard-coded stale test counts; record commands and latest verified count/date separately.
6. Update `docs/operations.md` with producer order, benchmark files, reconciliation formula, cron paths, rollback, and source freshness semantics.
7. Add route-level E2E smoke coverage for every new page.

---

# 5. Commit and deployment strategy

Use small commits; suggested sequence:

```text
test: define investment reconciliation contract
feat: add investment reconciliation repository
feat: expose portfolio reconciliation API
feat: add investment reconciliation dashboard
feat: show loan investment cash reconciliation
feat: add net financing cost to loan performance
feat: add benchmark series producer
feat: compare portfolio with 0050 total return
feat: add reconciliation integrity insights

test: define realized pnl attribution
feat: expose realized trade economics
feat: add portfolio return attribution
feat: add money-weighted portfolio return
feat: add research decision queue
feat: expose deterministic wealth alerts
feat: add deduplicated wealth alert runner

feat: add planning source contracts
feat: add monthly budget dashboard
feat: detect recurring cash flows
feat: add cash flow forecast
feat: add financial goal tracking
feat: add read-only financial scenarios
feat: add monthly financial review report

docs: update dashboard architecture and operations
```

For each phase:

1. Start from clean `master` tracking `origin/master`.
2. Implement checkpoint by checkpoint with failing tests first.
3. Run focused tests after each task.
4. Run the full quality gate before phase completion.
5. Obtain code review for financial formulas and source-date semantics.
6. Push commits before deployment.
7. Tag current production image for rollback.
8. Build while old container remains live.
9. Recreate only the dashboard service.
10. Verify health, API contracts, bind address, Cloudflare Access, and source mounts.
11. Keep rollback image until at least one complete relevant cycle passes:
    - one trading day for Phase 1/2 investment changes;
    - one monthly close for Phase 3 planning/reporting.

---

# 6. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Balance note date does not equal account-specific freshness | Pending trades may clear too early | Persist/read per-account as-of; stop Phase 1 if unavailable |
| `realized_pnl` fee semantics differ across imports | Double-count fee/tax | Add explicit audit mode and fixture verification |
| 0050 adjusted history changes retroactively | Broken total-return chain | Refresh whole validated history atomically |
| Financing baseline is unknown | Incorrect net return | Hide net metric until baseline is confirmed |
| Multi-theme attribution double counts | Totals exceed portfolio PnL | Use additive primary-theme policy and label all-theme exposure non-additive |
| Sparse Finance history | Bad recurring/forecast output | Require minimum observations and expose insufficient-data status |
| Telegram alert noise | User ignores important alerts | Action-needed only, stable IDs, dedupe state, reviewed thresholds |
| App starts writing financial data | Safety/privacy regression | Keep read-only routes and mounts; scenarios client-only |
| Producer and cron copies drift | Fix not used in production | Version scripts in repo and symlink Hermes paths |
| Documentation drifts again | Operators use stale commands | Operations docs use verified commands and dates, not permanent hard-coded counts |

---

# 7. Open decisions with recommended defaults

1. **0050 source:** use `0050.TW` adjusted-close history as a total-return proxy; show the basis explicitly. Keep TAIEX price index secondary.
2. **Financing baseline:** use strategy start date `2026-06-20`, but require a confirmed accrued-interest amount for that date before publishing net return.
3. **Settlement overdue threshold:** T+2 completed TWSE trading days, using the existing Taiwan exchange calendar.
4. **Cash freshness threshold:** notice after 7 calendar days; action-needed after 14 days, unless pending settlement already requires earlier action.
5. **Attribution themes:** primary canonical theme is additive; all-theme exposure remains descriptive/non-additive.
6. **Budget/goal storage:** allowlisted Obsidian notes under `Finance/Planning`, dashboard read-only.
7. **Forecast confidence:** no ETA/forecast from fewer than three complete months.
8. **Alert delivery:** existing ROHA investment thread, but exact target and message require approval immediately before cron creation.

---

# 8. Definition of done for the full roadmap

- [ ] All three phases have independent tests, commits, deployment checkpoints, and rollback points.
- [ ] Investment NAV is fully decomposable and reconciled.
- [ ] Policy-loan performance distinguishes gross and net-of-interest results.
- [ ] 0050 total return is the primary strategy benchmark.
- [ ] Realized/unrealized PnL and attribution reconcile to portfolio totals.
- [ ] TWR and XIRR are both available and clearly labeled.
- [ ] Research queue and alerts are deterministic and low-noise.
- [ ] Budget, forecast, goals, and scenarios expose assumptions and data sufficiency.
- [ ] Production remains read-only and private.
- [ ] No API leaks paths or raw vault content.
- [ ] Full Vitest, typecheck, lint, build, Python producer tests, E2E, and production probes pass.
- [ ] Documentation reflects the actual deployed artifact and cron architecture.
