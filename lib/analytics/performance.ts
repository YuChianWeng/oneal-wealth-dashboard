/**
 * Analytics — performance chart data computation.
 *
 * Builds time-series arrays for portfolio value, benchmark, and raw market
 * value from snapshot data. Portfolio returns are chain-linked after removing
 * explicitly recorded external cash flows; benchmark values use the snapshot's
 * recorded benchmark close rather than a synthetic mirror.
 */

import type { SnapshotPoint } from "@/lib/schemas/portfolio";
import { computePerformanceSeries } from "./portfolio-performance";
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
  return computePerformanceSeries(snapshots);
}
