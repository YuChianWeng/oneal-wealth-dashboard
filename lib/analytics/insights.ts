/**
 * Deterministic insight generator.
 *
 * Takes all available portfolio, finance, and research data and produces a
 * stable, repeatable list of actionable insights.  Given the same inputs,
 * the output is always identical (same IDs, same ordering).
 *
 * ## Versioning
 *
 * `INSIGHT_VERSION` is bumped whenever the rule logic changes in a way that
 * would cause insight IDs to shift.  Old consumers can compare their cached
 * version to decide whether to recalculate.
 *
 * ## Insight rules
 *
 * Each rule is a pure function.  Rules are evaluated in a fixed order, and
 * each rule may produce zero or more insights.  The order ensures stable
 * output across runs.
 */

import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { BalanceSnapshot } from "@/lib/schemas/finance";
import type { ResearchSummary } from "@/lib/schemas/research";
import type { Insight, InsightSeverity } from "./types";
import { concentrationRisk } from "./financial-health";
import {
  latestCompletedTwseTradingDay,
  taipeiDateISO,
} from "@/lib/market/twse-calendar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current insight version — bump when rule logic changes materially. */
export const INSIGHT_VERSION = "1.3";

/** Stale research threshold: research older than this many days triggers a warning. */
const STALE_RESEARCH_DAYS = 30;

/** High concentration threshold (% of portfolio in a single stock). */
const HIGH_CONCENTRATION_PCT = 30;

const DEFAULT_CASH_STALE_DAYS = 7;

// ---------------------------------------------------------------------------
// Insight generation context
// ---------------------------------------------------------------------------

/**
 * All the data an insight rule might need.
 * Every field is optional — rules gracefully handle missing data.
 */
export interface InsightContext {
  positions?: PositionSummary[];
  balanceSnapshots?: BalanceSnapshot[];
  researchSummaries?: ResearchSummary[];
  /** Symbols with a matching research note that failed parsing/validation. */
  invalidResearchSymbols?: string[];
  /** Auditable reconciliation output. Undefined means the source was not evaluated. */
  reconciliation?: ReconciliationInsightInput;
  /** Typed trade-integrity diagnostics; never raw source errors or paths. */
  tradeIntegrity?: TradeIntegrityInsightInput;
  /** Financing economics integrity state. */
  financing?: FinancingInsightInput;
  /** 0050 source/freshness state. */
  benchmark0050?: Benchmark0050InsightInput;
  /** Calendar-day threshold; defaults to stale when age is greater than 7. */
  cashStaleAfterDays?: number;
  /** ISO-8601 timestamp for "now" (allows deterministic testing). */
  now?: string;
}

export interface ReconciliationInsightInput {
  cashAsOfDate: string;
  pendingSettlements: readonly {
    id: string;
    symbol: string;
    status: "pending" | "overdue" | "covered-by-cash-snapshot";
  }[];
  /** Snapshot strategy value minus the independently reconciled value. */
  strategyEquationDelta?: number | null;
}

export interface TradeIntegrityInsightInput {
  missingNetCashflow: readonly {
    id: string;
    symbol: string;
  }[];
}

export interface FinancingInsightInput {
  status: "confirmed" | "partial" | "needs-review";
  statusReason: string | null;
}

export interface Benchmark0050InsightInput {
  sourceStatus: "available" | "missing" | "invalid";
  freshness: "fresh" | "stale" | "unavailable";
  latestDate: string | null;
  expectedLatestDate: string | null;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Deterministic insight ID from version + rule + optional key. */
function insightId(rule: string, key?: string): string {
  const base = `insight-${INSIGHT_VERSION}-${rule}`;
  return key ? `${base}-${key}` : base;
}

// ---------------------------------------------------------------------------
// Helper: date comparisons
// ---------------------------------------------------------------------------

/** Days between two ISO date strings. Positive means `earlier` is older. */
function daysBetween(now: string, earlier: string): number {
  const n = new Date(now);
  const e = new Date(earlier);
  return (n.getTime() - e.getTime()) / (1000 * 60 * 60 * 24);
}

/** Today's date as ISO string (YYYY-MM-DD). */
function todayISO(now?: string): string {
  if (now) return now.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function calendarDaysBetween(later: string, earlier: string): number | null {
  const laterMs = Date.parse(`${later}T00:00:00Z`);
  const earlierMs = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) return null;
  return Math.floor((laterMs - earlierMs) / (1000 * 60 * 60 * 24));
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function safePublicBusinessLabel(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9.^_-]{1,32}$/.test(trimmed) ? trimmed : "unknown";
}

// ---------------------------------------------------------------------------
// Insight factory
// ---------------------------------------------------------------------------

interface InsightTemplate {
  rule: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  drillThroughUrl: string;
  key?: string;
}

function makeInsight(tmpl: InsightTemplate, now?: string): Insight {
  return {
    id: insightId(tmpl.rule, tmpl.key),
    insightVersion: INSIGHT_VERSION,
    severity: tmpl.severity,
    title: tmpl.title,
    description: tmpl.description,
    drillThroughUrl: tmpl.drillThroughUrl,
    generatedAt: todayISO(now),
  };
}

// ---------------------------------------------------------------------------
// Phase 1 trust rules: reconciliation and freshness
// ---------------------------------------------------------------------------

function checkCashFreshness(
  reconciliation: ReconciliationInsightInput | undefined,
  nowDate: string,
  configuredThreshold: number | undefined,
): Insight[] {
  if (!reconciliation) return [];
  const ageDays = calendarDaysBetween(nowDate, reconciliation.cashAsOfDate);
  if (ageDays === null || ageDays < 0) return [];

  const staleAfterDays =
    Number.isInteger(configuredThreshold) && configuredThreshold! >= 0
      ? configuredThreshold!
      : DEFAULT_CASH_STALE_DAYS;
  if (ageDays <= staleAfterDays) return [];

  return [
    makeInsight({
      rule: "cash-freshness",
      severity: "action-needed",
      title: `Investment cash balance is ${ageDays} days old`,
      description: `Confirmed investment cash was last observed on ${reconciliation.cashAsOfDate}. Review the cash source before relying on reconciled strategy value.`,
      drillThroughUrl: "/portfolio/reconciliation",
    }),
  ];
}

function checkOverdueSettlements(
  reconciliation: ReconciliationInsightInput | undefined,
): Insight[] {
  if (!reconciliation) return [];
  const overdue = [...reconciliation.pendingSettlements]
    .filter((settlement) => settlement.status === "overdue")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (overdue.length === 0) return [];
  const symbols = sortedUnique(
    overdue.map((settlement) => safePublicBusinessLabel(settlement.symbol)),
  );
  return [
    makeInsight({
      rule: "overdue-settlement",
      severity: "action-needed",
      title: `${overdue.length} trade settlement(s) are overdue`,
      description: `${symbols.join(", ")} remain uncovered after their settlement boundary. Verify the trade and cash snapshot.`,
      drillThroughUrl: "/portfolio/reconciliation",
    }),
  ];
}

function checkMissingNetCashflow(
  tradeIntegrity: TradeIntegrityInsightInput | undefined,
): Insight[] {
  if (!tradeIntegrity) return [];
  const missing = [...tradeIntegrity.missingNetCashflow].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  if (missing.length === 0) return [];
  const ids = sortedUnique(missing.map((trade) => trade.id));
  const symbols = sortedUnique(
    missing.map((trade) => safePublicBusinessLabel(trade.symbol)),
  );
  return [
    makeInsight({
      rule: "missing-net-cashflow",
      severity: "action-needed",
      title: `${ids.length} trade(s) have invalid net cashflow`,
      description: `${symbols.join(", ")} cannot be reconciled because net cashflow is missing, zero, or invalid. Repair the transaction record before relying on strategy value.`,
      drillThroughUrl: "/portfolio/reconciliation",
    }),
  ];
}

function checkStrategyEquationMismatch(
  reconciliation: ReconciliationInsightInput | undefined,
): Insight[] {
  const delta = reconciliation?.strategyEquationDelta;
  if (
    typeof delta !== "number" ||
    !Number.isFinite(delta) ||
    Math.abs(delta) <= 1
  ) {
    return [];
  }
  return [
    makeInsight({
      rule: "strategy-equation-mismatch",
      severity: "action-needed",
      title: "Investment strategy equation does not reconcile",
      description: `The stored snapshot differs from confirmed cash plus pending settlements plus holdings by ${Math.abs(delta).toFixed(2)} TWD, beyond the accepted one-TWD rounding tolerance. Review the reconciliation inputs.`,
      drillThroughUrl: "/portfolio/reconciliation",
    }),
  ];
}

function checkFinancingIntegrity(
  financing: FinancingInsightInput | undefined,
): Insight[] {
  if (!financing || financing.status === "confirmed") return [];
  const reason =
    financing.statusReason?.trim() || "Financing inputs are incomplete";
  return [
    makeInsight({
      rule: "financing-integrity",
      severity: "action-needed",
      title: "Loan financing cost needs review",
      description: `${reason}. Net strategy value and net return must not be relied on until financing data is confirmed.`,
      drillThroughUrl: "/growth",
    }),
  ];
}

function checkBenchmark0050Freshness(
  benchmark: Benchmark0050InsightInput | undefined,
): Insight[] {
  if (
    !benchmark ||
    (benchmark.sourceStatus === "available" && benchmark.freshness === "fresh")
  ) {
    return [];
  }
  const sourceFailure = benchmark.sourceStatus !== "available";
  let detail: string;
  if (benchmark.sourceStatus === "missing") {
    detail = "The 0050 benchmark artifact is missing";
  } else if (benchmark.sourceStatus === "invalid") {
    detail = "The 0050 benchmark artifact is invalid";
  } else if (benchmark.freshness === "stale") {
    detail = `The latest 0050 observation (${benchmark.latestDate ?? "unknown"}) is older than the expected completed TWSE session (${benchmark.expectedLatestDate ?? "unknown"})`;
  } else {
    detail =
      "0050 freshness cannot be verified outside checked exchange-calendar coverage";
  }
  return [
    makeInsight({
      rule: "benchmark-0050-freshness",
      severity: sourceFailure ? "action-needed" : "notice",
      title: sourceFailure
        ? "0050 benchmark data is unavailable"
        : "0050 benchmark freshness needs review",
      description: `${detail}. Portfolio benchmark comparisons may be incomplete.`,
      drillThroughUrl: "/portfolio/performance",
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 1: Stale prices
// ---------------------------------------------------------------------------

function checkStalePrices(
  positions: PositionSummary[] | undefined,
  now: string,
): Insight[] {
  if (!positions || positions.length === 0) return [];

  const expectedDate = latestCompletedTwseTradingDay(now);
  const stale: PositionSummary[] = positions.filter(
    (position) => !position.lastChecked,
  );
  if (expectedDate) {
    for (const position of positions) {
      if (
        position.lastChecked &&
        position.lastChecked.slice(0, 10) < expectedDate
      ) {
        stale.push(position);
      }
    }
  }

  if (stale.length === 0) return [];

  const symbols = stale.map((p) => p.symbol).join(", ");
  const freshnessReason = expectedDate
    ? `older than the latest completed TWSE session (${expectedDate})`
    : "missing a last-checked date";
  return [
    makeInsight({
      rule: "stale-prices",
      severity: "action-needed",
      title: `${stale.length} holding(s) have stale prices`,
      description: `Current prices for ${symbols} are ${freshnessReason}. Market values and P&L may be inaccurate. Update price data in the Obsidian vault.`,
      drillThroughUrl: "/portfolio",
      key: stale
        .map((p) => p.symbol)
        .sort()
        .join("-"),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 2: Missing trade rationale
// ---------------------------------------------------------------------------

function checkMissingRationale(
  positions: PositionSummary[] | undefined,
  invalidResearchSymbols: string[] | undefined,
): Insight[] {
  if (!positions || positions.length === 0) return [];

  const invalidSymbols = new Set(
    (invalidResearchSymbols ?? []).map((symbol) => symbol.toUpperCase()),
  );
  // A position without conviction suggests missing research/trade rationale.
  // Invalid research is handled by its own rule; do not infer metadata gaps
  // from a note that could not be parsed.
  const missing: PositionSummary[] = positions.filter(
    (p) => p.conviction == null && !invalidSymbols.has(p.symbol.toUpperCase()),
  );

  if (missing.length === 0) return [];

  const symbols = missing.map((p) => p.symbol).join(", ");
  return [
    makeInsight({
      rule: "missing-rationale",
      severity: "notice",
      title: `${missing.length} holding(s) missing conviction rating`,
      description: `${symbols} have no conviction rating assigned. Consider documenting your investment thesis and conviction level for each holding.`,
      drillThroughUrl: "/research",
      key: missing
        .map((p) => p.symbol)
        .sort()
        .join("-"),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 3: High concentration risk
// ---------------------------------------------------------------------------

function checkHighConcentration(
  positions: PositionSummary[] | undefined,
): Insight[] {
  if (!positions || positions.length === 0) return [];

  const risk = concentrationRisk(positions);
  if (!risk || risk.maxWeight <= HIGH_CONCENTRATION_PCT) return [];

  return [
    makeInsight({
      rule: "high-concentration",
      severity: risk.maxWeight > 50 ? "action-needed" : "notice",
      title: `High concentration: ${risk.maxStock} at ${risk.maxWeight}%`,
      description: `${risk.maxName} (${risk.maxStock}) represents ${risk.maxWeight}% of your portfolio. Consider diversifying to reduce single-stock risk. The recommended maximum is ${HIGH_CONCENTRATION_PCT}%.`,
      drillThroughUrl: `/portfolio/${risk.maxStock}`,
      key: risk.maxStock,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 4: Stale research
// ---------------------------------------------------------------------------

function checkStaleResearch(
  researchSummaries: ResearchSummary[] | undefined,
  now: string,
): Insight[] {
  if (!researchSummaries || researchSummaries.length === 0) return [];

  const stale: ResearchSummary[] = [];
  for (const r of researchSummaries) {
    // Only check research for positions we actually hold (status = hold)
    // Also check research that has a lastUpdated date
    const lastUpdated = r.lastUpdated ?? r.sourceChecked;
    if (!lastUpdated) {
      stale.push(r);
      continue;
    }
    const days = daysBetween(now, lastUpdated);
    if (days > STALE_RESEARCH_DAYS) {
      stale.push(r);
    }
  }

  if (stale.length === 0) return [];

  const count = stale.length;
  const symbols = stale.map((r) => r.symbol).join(", ");
  return [
    makeInsight({
      rule: "stale-research",
      severity: count > 3 ? "action-needed" : "notice",
      title: `${count} stock(s) with stale research`,
      description: `Research for ${symbols} hasn't been updated in over ${STALE_RESEARCH_DAYS} days. Market conditions and fundamentals may have changed. Review and update your thesis.`,
      drillThroughUrl: "/research",
      key: stale
        .map((r) => r.symbol)
        .sort()
        .join("-"),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 5: Missing categories (sector / theme)
// ---------------------------------------------------------------------------

function checkMissingCategories(
  positions: PositionSummary[] | undefined,
  invalidResearchSymbols: string[] | undefined,
): Insight[] {
  if (!positions || positions.length === 0) return [];

  const invalidSymbols = new Set(
    (invalidResearchSymbols ?? []).map((symbol) => symbol.toUpperCase()),
  );
  const validPositions = positions.filter(
    (position) => !invalidSymbols.has(position.symbol.toUpperCase()),
  );
  const missingSector = validPositions.filter((p) => !p.sector?.trim());
  const missingTheme = validPositions.filter((p) => !p.theme?.trim());

  const insights: Insight[] = [];

  if (missingSector.length > 0) {
    const symbols = missingSector.map((p) => p.symbol).join(", ");
    insights.push(
      makeInsight({
        rule: "missing-sector",
        severity: "notice",
        title: `${missingSector.length} holding(s) missing sector`,
        description: `${symbols} have no sector classification. Add sector data to improve allocation analysis and risk assessment.`,
        drillThroughUrl: "/portfolio",
        key: missingSector
          .map((p) => p.symbol)
          .sort()
          .join("-"),
      }),
    );
  }

  if (missingTheme.length > 0) {
    const symbols = missingTheme.map((p) => p.symbol).join(", ");
    insights.push(
      makeInsight({
        rule: "missing-theme",
        severity: "info",
        title: `${missingTheme.length} holding(s) missing theme`,
        description: `${symbols} have no investment theme assigned. Adding theme tags helps track strategy alignment.`,
        drillThroughUrl: "/portfolio",
        key: missingTheme
          .map((p) => p.symbol)
          .sort()
          .join("-"),
      }),
    );
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Rule 6: Invalid research notes
// ---------------------------------------------------------------------------

function checkInvalidResearchNotes(
  positions: PositionSummary[] | undefined,
  invalidResearchSymbols: string[] | undefined,
): Insight[] {
  if (!positions || positions.length === 0 || !invalidResearchSymbols?.length) {
    return [];
  }

  const heldSymbols = new Set(positions.map((p) => p.symbol.toUpperCase()));
  const invalid = [
    ...new Set(invalidResearchSymbols.map((s) => s.toUpperCase())),
  ]
    .filter((symbol) => heldSymbols.has(symbol))
    .sort();
  if (invalid.length === 0) return [];

  return [
    makeInsight({
      rule: "invalid-research-note",
      severity: "action-needed",
      title: `${invalid.length} holding(s) have invalid research notes`,
      description: `Research notes for ${invalid.join(", ")} exist but could not be parsed or validated. Repair their frontmatter before relying on research metadata.`,
      drillThroughUrl: "/research",
      key: invalid.join("-"),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 7: Missing research notes
// ---------------------------------------------------------------------------

function checkMissingResearchNotes(
  positions: PositionSummary[] | undefined,
  researchSummaries: ResearchSummary[] | undefined,
  invalidResearchSymbols: string[] | undefined,
): Insight[] {
  if (!positions || positions.length === 0 || researchSummaries === undefined) {
    return [];
  }

  const researchSymbols = new Set(
    researchSummaries.map((r) => r.symbol.toUpperCase()),
  );
  const invalidSymbols = new Set(
    (invalidResearchSymbols ?? []).map((symbol) => symbol.toUpperCase()),
  );

  const missing = positions.filter((p) => {
    const symbol = p.symbol.toUpperCase();
    return !researchSymbols.has(symbol) && !invalidSymbols.has(symbol);
  });

  if (missing.length === 0) return [];

  const symbols = missing.map((p) => p.symbol).join(", ");
  return [
    makeInsight({
      rule: "missing-research-note",
      severity: "action-needed",
      title: `${missing.length} holding(s) without research notes`,
      description: `No research note found for ${symbols}. Create a research note in the Obsidian vault to document your thesis, catalysts, and risks.`,
      drillThroughUrl: "/research",
      key: missing
        .map((p) => p.symbol)
        .sort()
        .join("-"),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Rule 7: Empty portfolio (info)
// ---------------------------------------------------------------------------

function checkEmptyPortfolio(
  positions: PositionSummary[] | undefined,
): Insight[] {
  if (positions && positions.length > 0) return [];

  return [
    makeInsight({
      rule: "empty-portfolio",
      severity: "info",
      title: "No open positions",
      description:
        "Your portfolio has no open positions. Start by adding stocks to your watchlist and recording your first trade.",
      drillThroughUrl: "/portfolio",
    }),
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate all deterministic insights from the available data.
 *
 * Rules run in a fixed order.  Each rule is a pure function that receives
 * the full context and returns zero or more Insights.  The same input
 * always produces the same output (same IDs, same ordering).
 *
 * @param ctx  all available portfolio, finance, and research data.
 * @returns ordered list of insights, may be empty.
 */
export function generateInsights(ctx: InsightContext): Insight[] {
  const now = ctx.now ?? new Date().toISOString();
  const nowDate =
    taipeiDateISO(now) ??
    taipeiDateISO(new Date().toISOString()) ??
    new Date().toISOString().slice(0, 10);
  const positions = ctx.positions;
  const researchSummaries = ctx.researchSummaries;
  const invalidResearchSymbols = ctx.invalidResearchSymbols;

  const allInsights: Insight[] = [
    ...checkCashFreshness(ctx.reconciliation, nowDate, ctx.cashStaleAfterDays),
    ...checkOverdueSettlements(ctx.reconciliation),
    ...checkMissingNetCashflow(ctx.tradeIntegrity),
    ...checkStrategyEquationMismatch(ctx.reconciliation),
    ...checkFinancingIntegrity(ctx.financing),
    ...checkBenchmark0050Freshness(ctx.benchmark0050),
    ...checkStalePrices(positions, now),
    ...checkMissingRationale(positions, invalidResearchSymbols),
    ...checkHighConcentration(positions),
    ...checkStaleResearch(researchSummaries, nowDate),
    ...checkMissingCategories(positions, invalidResearchSymbols),
    ...checkInvalidResearchNotes(positions, invalidResearchSymbols),
    ...checkMissingResearchNotes(
      positions,
      researchSummaries,
      invalidResearchSymbols,
    ),
    ...checkEmptyPortfolio(positions),
  ];

  // Deduplicate by ID (shouldn't happen, but defensive) and stamp the
  // deterministic Asia/Taipei calendar date selected above.
  const seen = new Set<string>();
  return allInsights
    .filter((insight) => {
      if (seen.has(insight.id)) return false;
      seen.add(insight.id);
      return true;
    })
    .map((insight) => ({ ...insight, generatedAt: nowDate }));
}
