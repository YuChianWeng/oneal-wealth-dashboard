/**
 * Analytics — KPI computation from finance + portfolio data.
 *
 * Pure functions that take validated view-model inputs and produce
 * dashboard-ready derived metrics. These are intentionally decoupled
 * from any specific repository implementation.
 */

import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { MonthlySummary } from "@/lib/schemas/finance";
import type { KpiCard } from "./types";

// ---------------------------------------------------------------------------
// computeKpis
// ---------------------------------------------------------------------------

export interface KpiInputs {
  monthlySummary: MonthlySummary | null;
  positions: PositionSummary[];
  totalPortfolioValue: number;
}

/**
 * Compute the four overview KPI cards:
 *   1. Net Cash Flow   — this month's income minus expense
 *   2. Savings Rate    — (income - expense) / income
 *   3. Portfolio Value — total market value across all positions
 *   4. Portfolio PnL % — weighted unrealized PnL percentage
 */
export function computeKpis(inputs: KpiInputs): KpiCard[] {
  const { monthlySummary, positions, totalPortfolioValue } = inputs;

  const cards: KpiCard[] = [];

  // --- 1. Net Cash Flow ---
  if (monthlySummary) {
    cards.push({
      label: "Net Cash Flow",
      value: monthlySummary.netCashflow,
      prefix: "NT$",
      change: null, // change tracking requires previous month data (future enhancement)
      positiveIsGood: true,
    });
  } else {
    cards.push({
      label: "Net Cash Flow",
      value: 0,
      prefix: "NT$",
      change: null,
      positiveIsGood: true,
    });
  }

  // --- 2. Savings Rate ---
  if (monthlySummary && monthlySummary.totalIncome > 0) {
    const rate = monthlySummary.netCashflow / monthlySummary.totalIncome;
    cards.push({
      label: "Savings Rate",
      value: Math.round(rate * 10000) / 100,
      suffix: "%",
      change: null,
      positiveIsGood: true,
    });
  } else {
    cards.push({
      label: "Savings Rate",
      value: 0,
      suffix: "%",
      change: null,
      positiveIsGood: true,
    });
  }

  // --- 3. Portfolio Value ---
  cards.push({
    label: "Portfolio Value",
    value: totalPortfolioValue,
    prefix: "NT$",
    change: null,
    positiveIsGood: true,
  });

  // --- 4. Portfolio PnL % ---
  const totalCost = positions.reduce((sum, p) => sum + p.shares * p.avgCost, 0);
  if (totalCost > 0) {
    const pnlPct = ((totalPortfolioValue - totalCost) / totalCost) * 100;
    cards.push({
      label: "Portfolio PnL %",
      value: Math.round(pnlPct * 100) / 100,
      suffix: "%",
      change: null,
      positiveIsGood: true,
    });
  } else {
    cards.push({
      label: "Portfolio PnL %",
      value: 0,
      suffix: "%",
      change: null,
      positiveIsGood: true,
    });
  }

  return cards;
}
