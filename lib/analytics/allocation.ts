/**
 * Allocation analysis — breakdown of portfolio value by dimension.
 *
 * Pure functions that take validated position data and produce allocation
 * percentages at stock, sector, and theme levels.  Unclassified holdings
 * (those missing sector or theme metadata) are surfaced explicitly so the
 * user can see what's incomplete.
 *
 * These functions complement the existing `computeAllocation` in
 * lib/data/portfolio-calculations.ts by providing individual, focused
 * entry points suitable for dashboard widgets and insight generation.
 */

import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { AllocationBucket, AllocationResult } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the best available value for a position.
 * Prefers marketValue, falls back to shares × avgCost.
 */
function positionValue(p: PositionSummary): number {
  return p.marketValue ?? p.shares * p.avgCost;
}

/** Sum an array of numbers. */
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute allocation by individual stock holding.
 *
 * Each position gets its own bucket labelled `"SYMBOL — NAME"`.
 *
 * @param positions  list of open portfolio positions.
 * @returns one bucket per position, sorted descending by value.
 */
export function computeAllocationByStock(
  positions: PositionSummary[],
): AllocationBucket[] {
  if (positions.length === 0) return [];

  const total = sum(positions.map(positionValue));
  if (total <= 0) return [];

  const buckets: AllocationBucket[] = positions.map((p) => {
    const value = positionValue(p);
    return {
      label: `${p.symbol} — ${p.name}`,
      value,
      percentage: Math.round((value / total) * 100 * 100) / 100,
    };
  });

  buckets.sort((a, b) => b.value - a.value);
  return buckets;
}

/**
 * Compute allocation by sector.
 *
 * Holdings with a null/empty sector are grouped into an explicit
 * `"unclassified"` bucket rather than silently hidden.
 *
 * @param positions  list of open portfolio positions.
 * @returns one bucket per sector, plus "unclassified" if any, sorted by value.
 */
export function computeAllocationBySector(
  positions: PositionSummary[],
): AllocationBucket[] {
  if (positions.length === 0) return [];

  const total = sum(positions.map(positionValue));
  if (total <= 0) return [];

  const sectorMap = new Map<string, number>();
  let unclassifiedValue = 0;

  for (const p of positions) {
    const sector = p.sector?.trim();
    if (sector) {
      sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + positionValue(p));
    } else {
      unclassifiedValue += positionValue(p);
    }
  }

  const buckets: AllocationBucket[] = Array.from(sectorMap.entries()).map(
    ([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / total) * 100 * 100) / 100,
    }),
  );

  if (unclassifiedValue > 0) {
    buckets.push({
      label: "unclassified",
      value: unclassifiedValue,
      percentage: Math.round((unclassifiedValue / total) * 100 * 100) / 100,
    });
  }

  buckets.sort((a, b) => b.value - a.value);
  return buckets;
}

/**
 * Compute allocation by investment theme.
 *
 * Holdings with a null/empty theme are grouped into an explicit
 * `"unclassified"` bucket.
 *
 * @param positions  list of open portfolio positions.
 * @returns one bucket per theme, plus "unclassified" if any, sorted by value.
 */
export function computeAllocationByTheme(
  positions: PositionSummary[],
): AllocationBucket[] {
  if (positions.length === 0) return [];

  const total = sum(positions.map(positionValue));
  if (total <= 0) return [];

  const themeMap = new Map<string, number>();
  let unclassifiedValue = 0;

  for (const p of positions) {
    const theme = p.theme?.trim();
    if (theme) {
      themeMap.set(theme, (themeMap.get(theme) ?? 0) + positionValue(p));
    } else {
      unclassifiedValue += positionValue(p);
    }
  }

  const buckets: AllocationBucket[] = Array.from(themeMap.entries()).map(
    ([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / total) * 100 * 100) / 100,
    }),
  );

  if (unclassifiedValue > 0) {
    buckets.push({
      label: "unclassified",
      value: unclassifiedValue,
      percentage: Math.round((unclassifiedValue / total) * 100 * 100) / 100,
    });
  }

  buckets.sort((a, b) => b.value - a.value);
  return buckets;
}

/**
 * Convenience wrapper that returns all three allocation dimensions at once.
 *
 * @param positions  list of open portfolio positions.
 */
export function computeAllocationBreakdown(
  positions: PositionSummary[],
): AllocationResult {
  return {
    byStock: computeAllocationByStock(positions),
    bySector: computeAllocationBySector(positions),
    byTheme: computeAllocationByTheme(positions),
  };
}
