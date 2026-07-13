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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current insight version — bump when rule logic changes materially. */
export const INSIGHT_VERSION = "1.0";

/** Stale price threshold: prices older than this many days trigger a warning. */
const STALE_PRICE_DAYS = 1;

/** Stale research threshold: research older than this many days triggers a warning. */
const STALE_RESEARCH_DAYS = 30;

/** High concentration threshold (% of portfolio in a single stock). */
const HIGH_CONCENTRATION_PCT = 30;

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
  /** ISO-8601 timestamp for "now" (allows deterministic testing). */
  now?: string;
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
// Rule 1: Stale prices
// ---------------------------------------------------------------------------

function checkStalePrices(
  positions: PositionSummary[] | undefined,
  now: string,
): Insight[] {
  if (!positions || positions.length === 0) return [];

  const stale: PositionSummary[] = [];
  for (const p of positions) {
    if (!p.lastChecked) {
      stale.push(p);
      continue;
    }
    const days = daysBetween(now, p.lastChecked);
    if (days > STALE_PRICE_DAYS) {
      stale.push(p);
    }
  }

  if (stale.length === 0) return [];

  const symbols = stale.map((p) => p.symbol).join(", ");
  return [
    makeInsight({
      rule: "stale-prices",
      severity: "action-needed",
      title: `${stale.length} holding(s) have stale prices`,
      description: `Current prices for ${symbols} are more than ${STALE_PRICE_DAYS} day(s) old. Market values and P&L may be inaccurate. Update price data in the Obsidian vault.`,
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
): Insight[] {
  if (!positions || positions.length === 0) return [];

  // A position without conviction suggests missing research/trade rationale
  const missing: PositionSummary[] = positions.filter(
    (p) => p.conviction == null,
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
): Insight[] {
  if (!positions || positions.length === 0) return [];

  const missingSector = positions.filter((p) => !p.sector?.trim());
  const missingTheme = positions.filter((p) => !p.theme?.trim());

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
  const invalid = [...new Set(invalidResearchSymbols.map((s) => s.toUpperCase()))]
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
  if (!positions || positions.length === 0) return [];

  const researchSymbols = new Set(
    (researchSummaries ?? []).map((r) => r.symbol.toUpperCase()),
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
  const now = todayISO(ctx.now);
  const positions = ctx.positions;
  const researchSummaries = ctx.researchSummaries;
  const invalidResearchSymbols = ctx.invalidResearchSymbols;

  const allInsights: Insight[] = [
    ...checkStalePrices(positions, now),
    ...checkMissingRationale(positions),
    ...checkHighConcentration(positions),
    ...checkStaleResearch(researchSummaries, now),
    ...checkMissingCategories(positions),
    ...checkInvalidResearchNotes(positions, invalidResearchSymbols),
    ...checkMissingResearchNotes(
      positions,
      researchSummaries,
      invalidResearchSymbols,
    ),
    ...checkEmptyPortfolio(positions),
  ];

  // Deduplicate by ID (shouldn't happen, but defensive)
  const seen = new Set<string>();
  return allInsights.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}
