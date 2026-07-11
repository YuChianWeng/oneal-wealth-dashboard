/**
 * Financial health metrics — single-value indicators.
 *
 * Each function is a pure computation from one or more numeric inputs.
 * When data is insufficient (e.g. zero income, missing values), functions
 * return `null` rather than a misleading number.
 *
 * These are building blocks for the dashboard's health-at-a-glance section.
 */

import type { PositionSummary } from "@/lib/schemas/portfolio";

// ---------------------------------------------------------------------------
// Emergency fund
// ---------------------------------------------------------------------------

/**
 * How many months of expenses are covered by liquid assets.
 *
 * Formula: `liquidAssets / monthlyExpense`.
 *
 * Returns:
 * - A positive number when both inputs are valid and positive.
 * - `Infinity` when expenses are zero but assets are positive.
 * - `null` when either input is missing or negative.
 *
 * @param monthlyExpense  average monthly expense in TWD.
 * @param liquidAssets    readily available cash / liquid assets in TWD.
 */
export function emergencyFundMonths(
  monthlyExpense: number | null | undefined,
  liquidAssets: number | null | undefined,
): number | null {
  if (
    monthlyExpense == null ||
    liquidAssets == null ||
    !Number.isFinite(monthlyExpense) ||
    !Number.isFinite(liquidAssets)
  ) {
    return null;
  }

  if (monthlyExpense < 0 || liquidAssets < 0) {
    return null;
  }

  if (monthlyExpense === 0) {
    // No expenses — infinite runway.
    return liquidAssets > 0 ? Number.POSITIVE_INFINITY : null;
  }

  return Math.round((liquidAssets / monthlyExpense) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Savings rate
// ---------------------------------------------------------------------------

/**
 * Monthly savings rate as a percentage (0–100).
 *
 * Formula: `((income - expense) / income) * 100`.
 *
 * Returns:
 * - A percentage (can be negative if spending exceeds income).
 * - `null` when income is zero or missing (rate is undefined).
 *
 * @param income   total monthly income in TWD.
 * @param expense  total monthly expense in TWD.
 */
export function savingsRate(
  income: number | null | undefined,
  expense: number | null | undefined,
): number | null {
  if (
    income == null ||
    expense == null ||
    !Number.isFinite(income) ||
    !Number.isFinite(expense)
  ) {
    return null;
  }

  if (income === 0) {
    return null; // Rate is undefined when there's no income.
  }

  const rate = ((income - expense) / income) * 100;
  return Math.round(rate * 100) / 100;
}

// ---------------------------------------------------------------------------
// Debt ratio
// ---------------------------------------------------------------------------

/**
 * Debt-to-asset ratio as a percentage.
 *
 * Formula: `(liabilities / assets) * 100`.
 *
 * Returns:
 * - A percentage (0 = no debt, 100+ = debt exceeds assets).
 * - `null` when assets are zero or either input is missing.
 *
 * @param liabilities  total liabilities in TWD.
 * @param assets       total assets in TWD.
 */
export function debtRatio(
  liabilities: number | null | undefined,
  assets: number | null | undefined,
): number | null {
  if (
    liabilities == null ||
    assets == null ||
    !Number.isFinite(liabilities) ||
    !Number.isFinite(assets)
  ) {
    return null;
  }

  if (assets <= 0) {
    return null; // Ratio is undefined.
  }

  const ratio = (liabilities / assets) * 100;
  return Math.round(ratio * 100) / 100;
}

// ---------------------------------------------------------------------------
// Concentration risk
// ---------------------------------------------------------------------------

/**
 * Result from concentrationRisk().
 */
export interface ConcentrationRiskResult {
  /** Symbol of the largest holding. */
  maxStock: string;
  /** Name of the largest holding. */
  maxName: string;
  /** Weight of the largest holding as a percentage (0–100). */
  maxWeight: number;
}

/**
 * Identify the single largest holding in the portfolio.
 *
 * Uses `marketValue` when available; falls back to `shares × avgCost`.
 *
 * @param positions  list of open portfolio positions.
 * @returns the largest holding, or null when the position list is empty.
 */
export function concentrationRisk(
  positions: PositionSummary[],
): ConcentrationRiskResult | null {
  if (positions.length === 0) return null;

  const totalValue = positions.reduce((sum, p) => {
    return sum + (p.marketValue ?? p.shares * p.avgCost);
  }, 0);

  if (totalValue <= 0) return null;

  let maxPos = positions[0];
  let maxVal = maxPos.marketValue ?? maxPos.shares * maxPos.avgCost;

  for (let i = 1; i < positions.length; i++) {
    const val =
      positions[i].marketValue ?? positions[i].shares * positions[i].avgCost;
    if (val > maxVal) {
      maxVal = val;
      maxPos = positions[i];
    }
  }

  return {
    maxStock: maxPos.symbol,
    maxName: maxPos.name,
    maxWeight: Math.round((maxVal / totalValue) * 100 * 100) / 100,
  };
}
