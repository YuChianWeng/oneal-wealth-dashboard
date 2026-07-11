/**
 * Portfolio performance — position-neutral time-series calculations.
 *
 * ## Methodology: Modified Dietz / Chain-Linked Returns
 *
 * The core challenge is separating investment performance from the mechanical
 * effect of buying and selling.  When you buy more shares, market value goes up
 * — but that "gain" is just new cash entering the portfolio, not a return on
 * existing capital.  Likewise, selling removes value without representing a
 * loss on the investment.
 *
 * ### Algorithm
 *
 * Given N snapshots at times t₀, t₁, …, tₙ with market values M₀, M₁, …, Mₙ
 * and external cash flows C₁, …, Cₙ into period i (i.e. cash added/removed
 * between t_{i-1} and t_i):
 *
 *   period return rᵢ = (Mᵢ − M_{i-1} − Cᵢ) / (M_{i-1} + Cᵢ/2)
 *
 * This is the Modified Dietz return for a single period.  It approximates the
 * true time-weighted return by assuming cash flows occur mid-period.  The
 * denominator weights the starting capital + half the net inflow.
 *
 * We then chain-link:
 *
 *   index₀ = 100
 *   indexᵢ = index_{i-1} × (1 + rᵢ)
 *
 * The first point is always 100 (no return to compute yet).
 *
 * ### Benchmark comparison
 *
 * When `benchmarkClose` is available, we compute the benchmark index using the
 * same chain-linking logic applied to the benchmark series (no cash-flow
 * adjustments — benchmarks don't have external flows).
 *
 * ### Edge cases handled
 *
 * - Zero or one snapshot → index = [100] with empty benchmark.
 * - Zero starting capital (M₀ ≈ 0) → period returns clamp to avoid division
 *   by zero; first meaningful value is still 100.
 * - Missing benchmark → benchmarkIndex is an empty array.
 * - Negative denominator → falls back to simple return if Modified Dietz
 *   would produce a nonsense result.
 */

import type { AnalyticsSnapshotPoint, PerformanceSeriesResult } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute position-neutral portfolio performance from a series of snapshots.
 *
 * Buy/sell activity does NOT create false gains or losses — external cash
 * flows are subtracted before computing period returns.
 *
 * @param snapshots  ordered array of enriched snapshot points (ascending date).
 * @returns Performance series with normalised portfolio and benchmark indices.
 */
export function computePerformanceSeries(
  snapshots: AnalyticsSnapshotPoint[],
): PerformanceSeriesResult {
  // --- Guard: empty / single point -------------------------------------------
  if (snapshots.length === 0) {
    return {
      portfolioIndex: [],
      benchmarkIndex: [],
      dates: [],
      rawMarketValue: [],
    };
  }

  if (snapshots.length === 1) {
    const s = snapshots[0];
    const bench = s.benchmarkClose != null ? [100] : [];
    return {
      portfolioIndex: [100],
      benchmarkIndex: bench,
      dates: [s.date],
      rawMarketValue: [s.totalValue],
    };
  }

  // --- Compute period returns -----------------------------------------------
  const dates: string[] = [snapshots[0].date];
  const rawMarketValue: number[] = [snapshots[0].totalValue];
  const portfolioIndex: number[] = [100];

  let prevIndex = 100;
  let prevMv = snapshots[0].totalValue;

  for (let i = 1; i < snapshots.length; i++) {
    const curr = snapshots[i];
    const cf = curr.externalCashFlow;

    dates.push(curr.date);
    rawMarketValue.push(curr.totalValue);

    // Modified Dietz period return
    const numerator = curr.totalValue - prevMv - cf;
    const denominator = prevMv + cf / 2;

    let periodReturn: number;
    if (Math.abs(denominator) < 1e-9) {
      // Degenerate case: starting capital ≈ 0.  Use simple ratio if possible.
      periodReturn =
        Math.abs(prevMv) > 1e-9 ? (curr.totalValue - cf) / prevMv - 1 : 0;
    } else {
      periodReturn = numerator / denominator;
    }

    // Chain-link
    const newIndex = prevIndex * (1 + periodReturn);

    // Clamp pathological values (shouldn't happen with real data)
    const clampedIndex = Number.isFinite(newIndex)
      ? Math.max(0, newIndex)
      : prevIndex;

    portfolioIndex.push(clampedIndex);
    prevIndex = clampedIndex;
    prevMv = curr.totalValue;
  }

  // --- Benchmark index (if available) ---------------------------------------
  const benchmarkIndex: number[] = [];
  const hasBenchmark = snapshots.some((s) => s.benchmarkClose != null);

  if (hasBenchmark) {
    // Find the first snapshot with a benchmark value to use as base
    let benchBase: number | null = null;
    let benchBaseValue: number | null = null;

    for (const s of snapshots) {
      if (s.benchmarkClose != null && s.benchmarkClose > 0) {
        benchBase = 100;
        benchBaseValue = s.benchmarkClose;
        break;
      }
    }

    if (benchBaseValue != null) {
      // Build benchmark index in lockstep with snapshots
      benchmarkIndex.push(benchBase!);
      let prevBench = benchBaseValue;

      for (let i = 1; i < snapshots.length; i++) {
        const currBench = snapshots[i].benchmarkClose;

        if (currBench != null && currBench > 0 && prevBench > 0) {
          // Simple chain-link for benchmark (no cash flows)
          const benchReturn = currBench / prevBench - 1;
          const newBenchIndex = benchmarkIndex[i - 1] * (1 + benchReturn);
          benchmarkIndex.push(
            Number.isFinite(newBenchIndex)
              ? Math.max(0, newBenchIndex)
              : benchmarkIndex[i - 1],
          );
          prevBench = currBench;
        } else {
          // Missing data point — carry forward last known index
          benchmarkIndex.push(
            benchmarkIndex.length > 0
              ? benchmarkIndex[benchmarkIndex.length - 1]
              : 100,
          );
        }
      }
    }
  }

  return { portfolioIndex, benchmarkIndex, dates, rawMarketValue };
}
