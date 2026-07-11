/**
 * Analytics — cash flow aggregation from finance data.
 */

import type { MonthlySummary } from "@/lib/schemas/finance";
import type { MonthlyCashFlowPoint } from "./types";

// ---------------------------------------------------------------------------
// computeCashFlow
// ---------------------------------------------------------------------------

/**
 * Build a sorted monthly cash-flow series from a map of month → summary.
 */
export function computeCashFlow(
  summaries: Map<string, MonthlySummary>,
): MonthlyCashFlowPoint[] {
  const points: MonthlyCashFlowPoint[] = [];

  for (const [month, summary] of summaries) {
    points.push({
      month,
      income: summary.totalIncome,
      expense: summary.totalExpense,
      netCashflow: summary.netCashflow,
    });
  }

  // Sort ascending by month
  points.sort((a, b) => a.month.localeCompare(b.month));

  return points;
}
