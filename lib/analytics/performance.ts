/**
 * Analytics — performance chart data computation.
 *
 * Builds time-series arrays for portfolio value, benchmark, and raw market
 * value from snapshot data.
 */

import type { SnapshotPoint } from "@/lib/schemas/portfolio";
import type { PerformanceChartData } from "./types";

// ---------------------------------------------------------------------------
// computePerformanceChart
// ---------------------------------------------------------------------------

/**
 * Convert a sorted array of SnapshotPoints into chart-ready arrays.
 *
 * The portfolio index is normalized to 100 at the first snapshot.
 * Benchmark is a placeholder (TODO: integrate TWSE/TAIEX data).
 */
export function computePerformanceChart(
  snapshots: SnapshotPoint[],
): PerformanceChartData {
  if (snapshots.length === 0) {
    return {
      dates: [],
      portfolioIndex: [],
      benchmarkIndex: [],
      rawMarketValue: [],
    };
  }

  const dates: string[] = [];
  const rawMarketValue: number[] = [];
  const portfolioIndex: number[] = [];

  // Normalize to 100 at base
  const baseValue = snapshots[0].totalValue;
  const baseIsZero = baseValue === 0;

  for (const snap of snapshots) {
    dates.push(snap.date);
    rawMarketValue.push(snap.totalValue);
    portfolioIndex.push(
      baseIsZero
        ? 100
        : Math.round((snap.totalValue / baseValue) * 100 * 100) / 100,
    );
  }

  // Benchmark: mirror the portfolio for now (placeholder)
  const benchmarkIndex = [...portfolioIndex];

  return { dates, portfolioIndex, benchmarkIndex, rawMarketValue };
}
