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

import type {
  AlignedBenchmarkSeries,
  AnalyticsSnapshotPoint,
  BenchmarkComparisonInput,
  BenchmarkComparisonResult,
  BenchmarkValuePoint,
  PerformanceSeriesResult,
} from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Align market observations to portfolio dates without look-ahead bias.
 * Each date receives the latest benchmark value on or before it. The first
 * available aligned value is the base (100); earlier dates remain explicitly
 * null rather than being filled from the future. Non-positive and non-finite
 * values are ignored. Both date inputs must already be strictly increasing;
 * duplicates or out-of-order dates throw rather than being silently reordered.
 */
export function alignBenchmarkSeries(
  portfolioDates: string[],
  benchmarkPoints: BenchmarkValuePoint[],
): AlignedBenchmarkSeries {
  assertStrictlyIncreasing(portfolioDates, "portfolio dates");
  assertStrictlyIncreasing(
    benchmarkPoints.map((point) => point.date),
    "benchmark dates",
  );
  const validPoints = benchmarkPoints.filter(
    (point) => Number.isFinite(point.value) && point.value > 0,
  );
  const alignedValues: Array<number | null> = [];
  const observationDates: Array<string | null> = [];
  let pointIndex = 0;
  let latest: BenchmarkValuePoint | null = null;

  for (const portfolioDate of portfolioDates) {
    while (
      pointIndex < validPoints.length &&
      validPoints[pointIndex].date <= portfolioDate
    ) {
      latest = validPoints[pointIndex];
      pointIndex += 1;
    }
    alignedValues.push(latest?.value ?? null);
    observationDates.push(latest?.date ?? null);
  }

  const baseValue = alignedValues.find((value) => value !== null) ?? null;
  const index = alignedValues.map((value) =>
    value === null || baseValue === null ? null : (value / baseValue) * 100,
  );

  return { index, observationDates };
}

/**
 * Build a common-base benchmark comparison without I/O. Only checkpoints where
 * the primary observation date advances contribute to returns or win rate.
 * Carry-forward snapshots therefore cannot extend the measurement interval or
 * create mismatched weekend periods.
 */
export function computeBenchmarkComparison(
  input: BenchmarkComparisonInput,
): BenchmarkComparisonResult {
  const { dates, portfolioIndex, primary, secondary } = input;
  assertStrictlyIncreasing(dates, "portfolio dates");
  assertEqualLengths(dates.length, {
    portfolioIndex,
    primaryIndex: primary.index,
    primaryObservationDates: primary.observationDates,
    ...(secondary
      ? {
          secondaryIndex: secondary.index,
          secondaryObservationDates: secondary.observationDates,
        }
      : {}),
  });

  const checkpoints: number[] = [];
  let previousObservation: string | null = null;
  for (let index = 0; index < dates.length; index++) {
    const observation = primary.observationDates[index];
    const primaryValue = primary.index[index];
    if (
      observation !== null &&
      observation !== previousObservation &&
      primaryValue !== null &&
      Number.isFinite(primaryValue)
    ) {
      checkpoints.push(index);
      previousObservation = observation;
    }
  }

  const start = checkpoints[0] ?? -1;
  const end = checkpoints.at(-1) ?? -1;
  const normalizedPortfolio = normalizeWithinWindow(portfolioIndex, start, end);
  const normalizedPrimary = normalizeWithinWindow(primary.index, start, end);
  let secondaryComparisonStatus: BenchmarkComparisonResult["secondaryComparisonStatus"];
  let normalizedSecondary: Array<number | null>;
  if (secondary === null) {
    secondaryComparisonStatus = "source-unavailable";
    normalizedSecondary = dates.map(() => null);
  } else if (start < 0 || secondary.index[start] === null) {
    secondaryComparisonStatus = "not-comparable-at-primary-base";
    normalizedSecondary = dates.map(() => null);
  } else {
    normalizedSecondary = normalizeWithinWindow(secondary.index, start, end);
    secondaryComparisonStatus = normalizedSecondary[start] === null
      ? "not-comparable-at-primary-base"
      : "comparable";
  }

  const insufficient = checkpoints.length < 2;
  let wins = 0;
  let periods = 0;
  if (!insufficient) {
    for (let checkpoint = 1; checkpoint < checkpoints.length; checkpoint++) {
      const previous = checkpoints[checkpoint - 1];
      const current = checkpoints[checkpoint];
      const portfolioReturn = intervalReturn(
        portfolioIndex[previous],
        portfolioIndex[current],
      );
      const primaryReturn = intervalReturn(
        primary.index[previous],
        primary.index[current],
      );
      if (portfolioReturn === null || primaryReturn === null) continue;
      periods += 1;
      // Treat negligible floating-point noise as a tie.
      if (portfolioReturn - primaryReturn > 1e-12) wins += 1;
    }
  }

  const portfolioReturnPct = insufficient
    ? null
    : percentageReturn(portfolioIndex[start], portfolioIndex[end]);
  const primaryReturnPct = insufficient
    ? null
    : percentageReturn(primary.index[start], primary.index[end]);
  const measurable =
    !insufficient && portfolioReturnPct !== null && primaryReturnPct !== null;

  return {
    portfolioIndex: normalizedPortfolio,
    primaryIndex: normalizedPrimary,
    secondaryIndex: normalizedSecondary,
    secondaryComparisonStatus,
    comparison: {
      status: measurable ? "measurable" : "insufficient-data",
      startDate: start < 0 ? null : dates[start],
      endDate: end < 0 ? null : dates[end],
      distinctObservationCount: checkpoints.length,
      portfolioReturnPct: measurable ? portfolioReturnPct : null,
      primaryReturnPct: measurable ? primaryReturnPct : null,
      excessReturnPct:
        measurable ? portfolioReturnPct - primaryReturnPct : null,
      winRatePct: measurable && periods > 0 ? (wins / periods) * 100 : null,
      wins: measurable ? wins : 0,
      periods: measurable ? periods : 0,
    },
  };
}

function assertStrictlyIncreasing(values: string[], label: string): void {
  for (let index = 1; index < values.length; index++) {
    if (values[index] <= values[index - 1]) {
      throw new Error(`${label} must be strictly increasing`);
    }
  }
}

function assertEqualLengths(
  expected: number,
  values: Record<string, readonly unknown[]>,
): void {
  for (const [label, value] of Object.entries(values)) {
    if (value.length !== expected) {
      throw new Error(`${label} must align one-for-one with portfolio dates`);
    }
  }
}

function normalizeWithinWindow(
  values: ReadonlyArray<number | null>,
  start: number,
  end: number,
): Array<number | null> {
  if (start < 0 || end < start) return values.map(() => null);
  const base = values[start];
  if (base === null || !Number.isFinite(base) || base === 0) {
    return values.map(() => null);
  }
  return values.map((value, index) =>
    index < start ||
    index > end ||
    value === null ||
    !Number.isFinite(value)
      ? null
      : (value / base) * 100,
  );
}

function intervalReturn(start: number | null, end: number | null): number | null {
  if (
    start === null ||
    end === null ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start === 0
  ) {
    return null;
  }
  return end / start - 1;
}

function percentageReturn(
  start: number | null,
  end: number | null,
): number | null {
  const value = intervalReturn(start, end);
  return value === null ? null : value * 100;
}

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
