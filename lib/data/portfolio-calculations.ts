"use server";

/**
 * Portfolio calculations — derived metrics from position data.
 *
 * Pure functions that compute allocation, weighted cost, and other
 * portfolio-level aggregates. No file I/O — operates on validated
 * PositionSummary objects.
 */

import { assertServerOnly } from "@/lib/server-only";
import {
  type PositionSummary,
  type HoldingAllocation,
} from "@/lib/schemas/portfolio";

assertServerOnly();

// ---------------------------------------------------------------------------
// computeAllocation
// ---------------------------------------------------------------------------

export interface AllocationResult {
  /** Per-stock allocation breakdown. */
  byStock: HoldingAllocation[];
  /** Per-sector allocation breakdown. */
  bySector: HoldingAllocation[];
  /** Per-theme allocation breakdown. */
  byTheme: HoldingAllocation[];
  /** Positions that have no sector or theme assigned. */
  unclassified: PositionSummary[];
}

/**
 * Compute portfolio allocation across stock, sector, and theme dimensions.
 *
 * Uses `marketValue` when available, otherwise falls back to `shares * avgCost`.
 * Unclassified holdings (no sector or theme) are identified separately.
 */
export function computeAllocation(
  positions: PositionSummary[],
): AllocationResult {
  const totalValue = positions.reduce((sum, p) => {
    const val = p.marketValue ?? p.shares * p.avgCost;
    return sum + val;
  }, 0);

  const unclassified: PositionSummary[] = [];

  // --- By stock ---
  const byStock: HoldingAllocation[] = positions.map((p) => {
    const value = p.marketValue ?? p.shares * p.avgCost;
    const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
    return {
      category: `${p.symbol} — ${p.name}`,
      value,
      percentage: Math.round(percentage * 100) / 100,
    };
  });

  // --- By sector ---
  const sectorMap = new Map<string, number>();
  for (const p of positions) {
    const sector = p.sector?.trim();
    if (!sector) {
      unclassified.push(p);
      continue;
    }
    const value = p.marketValue ?? p.shares * p.avgCost;
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + value);
  }
  const bySector: HoldingAllocation[] = Array.from(sectorMap.entries())
    .map(([category, value]) => ({
      category,
      value,
      percentage:
        totalValue > 0 ? Math.round((value / totalValue) * 100 * 100) / 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // --- By theme ---
  const themeMap = new Map<string, number>();
  for (const p of positions) {
    const theme = p.theme?.trim();
    if (!theme) continue;
    const value = p.marketValue ?? p.shares * p.avgCost;
    themeMap.set(theme, (themeMap.get(theme) ?? 0) + value);
  }
  const byTheme: HoldingAllocation[] = Array.from(themeMap.entries())
    .map(([category, value]) => ({
      category,
      value,
      percentage:
        totalValue > 0 ? Math.round((value / totalValue) * 100 * 100) / 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return { byStock, bySector, byTheme, unclassified };
}

// ---------------------------------------------------------------------------
// computeWeightedCost
// ---------------------------------------------------------------------------

/**
 * Compute the weighted average entry cost from a series of lots.
 *
 * Each lot is described by its number of shares and entry price.
 * Returns 0 if total shares is 0.
 */
export function computeWeightedCost(
  lots: Array<{ shares: number; price: number }>,
): number {
  let totalCost = 0;
  let totalShares = 0;

  for (const lot of lots) {
    totalCost += lot.shares * lot.price;
    totalShares += lot.shares;
  }

  if (totalShares <= 0) return 0;

  return Math.round((totalCost / totalShares) * 100) / 100;
}

/**
 * Compute weighted average cost from position summaries.
 *
 * Each position contributes its `avgCost * shares` to the weighted average.
 */
export function computeWeightedCostFromPositions(
  positions: PositionSummary[],
): number {
  return computeWeightedCost(
    positions.map((p) => ({ shares: p.shares, price: p.avgCost })),
  );
}
