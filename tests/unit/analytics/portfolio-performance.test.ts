/**
 * Tests for portfolio-performance.ts — position-neutral time-series returns.
 */

import { describe, expect, it } from "vitest";
import { computePerformanceSeries } from "@/lib/analytics/portfolio-performance";
import type { AnalyticsSnapshotPoint } from "@/lib/analytics/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Simple 5-day series with no cash flows — pure market appreciation.
 * Start: 100000, End: 110000 (+10%).
 */
const simpleSeries: AnalyticsSnapshotPoint[] = [
  {
    date: "2026-07-01",
    totalValue: 100_000,
    externalCashFlow: 0,
    benchmarkClose: 10000,
  },
  {
    date: "2026-07-02",
    totalValue: 102_000,
    externalCashFlow: 0,
    benchmarkClose: 10200,
  },
  {
    date: "2026-07-03",
    totalValue: 105_000,
    externalCashFlow: 0,
    benchmarkClose: 10400,
  },
  {
    date: "2026-07-04",
    totalValue: 107_000,
    externalCashFlow: 0,
    benchmarkClose: 10650,
  },
  {
    date: "2026-07-05",
    totalValue: 110_000,
    externalCashFlow: 0,
    benchmarkClose: 11000,
  },
];

/**
 * Series where the user buys more shares mid-period.
 * Without cash-flow adjustment this would look like a gain — it's not.
 * Day 2: bought 20000 TWD worth. Market moved to 122000 → only 2000 real gain.
 */
const seriesWithBuy: AnalyticsSnapshotPoint[] = [
  {
    date: "2026-07-01",
    totalValue: 100_000,
    externalCashFlow: 0,
    benchmarkClose: 10000,
  },
  {
    date: "2026-07-02",
    totalValue: 122_000,
    externalCashFlow: 20_000,
    benchmarkClose: 10100,
  },
  {
    date: "2026-07-03",
    totalValue: 125_000,
    externalCashFlow: 0,
    benchmarkClose: 10250,
  },
];

/**
 * Series where the user sells shares.
 * Without adjustment the drop would look like a loss.
 */
const seriesWithSell: AnalyticsSnapshotPoint[] = [
  {
    date: "2026-07-01",
    totalValue: 100_000,
    externalCashFlow: 0,
    benchmarkClose: 10000,
  },
  {
    date: "2026-07-02",
    totalValue: 72_000,
    externalCashFlow: -30_000,
    benchmarkClose: 10050,
  },
];

/**
 * Series with no benchmark data.
 */
const seriesNoBenchmark: AnalyticsSnapshotPoint[] = [
  {
    date: "2026-07-01",
    totalValue: 100_000,
    externalCashFlow: 0,
    benchmarkClose: null,
  },
  {
    date: "2026-07-02",
    totalValue: 103_000,
    externalCashFlow: 0,
    benchmarkClose: null,
  },
];

/**
 * Series with partial benchmark data.
 */
const seriesPartialBenchmark: AnalyticsSnapshotPoint[] = [
  {
    date: "2026-07-01",
    totalValue: 100_000,
    externalCashFlow: 0,
    benchmarkClose: 10000,
  },
  {
    date: "2026-07-02",
    totalValue: 103_000,
    externalCashFlow: 0,
    benchmarkClose: null,
  },
  {
    date: "2026-07-03",
    totalValue: 106_000,
    externalCashFlow: 0,
    benchmarkClose: 10600,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computePerformanceSeries", () => {
  // ---- Empty / single-point -------------------------------------------------

  it("returns empty arrays for empty input", () => {
    const result = computePerformanceSeries([]);
    expect(result.portfolioIndex).toEqual([]);
    expect(result.benchmarkIndex).toEqual([]);
    expect(result.dates).toEqual([]);
    expect(result.rawMarketValue).toEqual([]);
  });

  it("returns index 100 for a single snapshot", () => {
    const result = computePerformanceSeries([
      {
        date: "2026-07-01",
        totalValue: 100_000,
        externalCashFlow: 0,
        benchmarkClose: 10000,
      },
    ]);
    expect(result.portfolioIndex).toEqual([100]);
    expect(result.benchmarkIndex).toEqual([100]);
    expect(result.dates).toEqual(["2026-07-01"]);
    expect(result.rawMarketValue).toEqual([100_000]);
  });

  it("returns empty benchmark for single snapshot without benchmark", () => {
    const result = computePerformanceSeries([
      {
        date: "2026-07-01",
        totalValue: 100_000,
        externalCashFlow: 0,
        benchmarkClose: null,
      },
    ]);
    expect(result.benchmarkIndex).toEqual([]);
  });

  // ---- Simple series: no cash flows ----------------------------------------

  it("computes chain-linked returns correctly (no cash flows)", () => {
    const result = computePerformanceSeries(simpleSeries);

    // 5 data points
    expect(result.dates).toHaveLength(5);
    expect(result.portfolioIndex).toHaveLength(5);
    expect(result.rawMarketValue).toHaveLength(5);

    // First point is always 100
    expect(result.portfolioIndex[0]).toBe(100);

    // End value: market went 100k → 110k = +10%
    // Chain-linked: (1+0.02)*(1+0.02941)*(1+0.01905)*(1+0.02804) ≈ 1.10
    expect(result.portfolioIndex[4]).toBeCloseTo(110, 1);

    // Benchmark: 10000 → 11000 = +10%
    expect(result.benchmarkIndex).toHaveLength(5);
    expect(result.benchmarkIndex[0]).toBe(100);
    expect(result.benchmarkIndex[4]).toBeCloseTo(110, 1);
  });

  // ---- Buy does NOT create false gain ---------------------------------------

  it("does NOT treat buy as a gain", () => {
    const result = computePerformanceSeries(seriesWithBuy);

    // Day 0 → Day 1: market went 100k to 122k but 20k was cash inflow.
    // "Real" gain = (122000 - 100000 - 20000) / (100000 + 20000/2)
    //              = 2000 / 110000 ≈ 0.01818 → index = 101.82
    expect(result.portfolioIndex[1]).toBeCloseTo(101.82, 2);

    // Day 1 → Day 2: 122k → 125k, no cash flow
    // (125000 - 122000) / 122000 ≈ 0.02459
    // index = 101.82 * 1.02459 ≈ 104.33
    expect(result.portfolioIndex[2]).toBeCloseTo(104.33, 1);
  });

  it("does NOT treat sell as a loss", () => {
    const result = computePerformanceSeries(seriesWithSell);

    // Market 100k → 72k, but 30k was withdrawn.
    // "Real" change = (72000 - 100000 - (-30000)) / (100000 + (-30000)/2)
    //                = (72000 - 100000 + 30000) / (100000 - 15000)
    //                = 2000 / 85000 ≈ 0.02353 → index = 102.35
    expect(result.portfolioIndex[1]).toBeCloseTo(102.35, 1);
  });

  // ---- Missing benchmark ----------------------------------------------------

  it("returns empty benchmarkIndex when no benchmark data", () => {
    const result = computePerformanceSeries(seriesNoBenchmark);
    expect(result.benchmarkIndex).toEqual([]);
    expect(result.portfolioIndex).toHaveLength(2);
  });

  it("handles partial benchmark data (carries forward)", () => {
    const result = computePerformanceSeries(seriesPartialBenchmark);

    // Should have benchmark data (at least first and last points)
    expect(result.benchmarkIndex).toHaveLength(3);
    expect(result.benchmarkIndex[0]).toBe(100);

    // Day 2 missing → carries forward day 1's index
    expect(result.benchmarkIndex[1]).toBe(result.benchmarkIndex[0]);

    // Day 3 has data
    expect(result.benchmarkIndex[2]).toBeGreaterThan(100);
  });

  // ---- Edge cases -----------------------------------------------------------

  it("handles zero starting capital", () => {
    const result = computePerformanceSeries([
      {
        date: "2026-07-01",
        totalValue: 0,
        externalCashFlow: 0,
        benchmarkClose: null,
      },
      {
        date: "2026-07-02",
        totalValue: 50_000,
        externalCashFlow: 50_000,
        benchmarkClose: null,
      },
    ]);
    // First point is 100
    expect(result.portfolioIndex[0]).toBe(100);
    // New cash added = no performance, index should stay near 100
    // Modified Dietz with prevMv=0 and cf=50k:
    // numerator = 50000 - 0 - 50000 = 0; denominator = 0 + 25000 = 25000
    // Actually prevMv=0 → degenerate case → periodReturn=0 → index stays 100
    expect(result.portfolioIndex[1]).toBe(100);
  });

  it("handles all identical values", () => {
    const result = computePerformanceSeries([
      {
        date: "2026-07-01",
        totalValue: 100_000,
        externalCashFlow: 0,
        benchmarkClose: 10000,
      },
      {
        date: "2026-07-02",
        totalValue: 100_000,
        externalCashFlow: 0,
        benchmarkClose: 10000,
      },
      {
        date: "2026-07-03",
        totalValue: 100_000,
        externalCashFlow: 0,
        benchmarkClose: 10000,
      },
    ]);
    // No change → index stays at 100
    expect(result.portfolioIndex).toEqual([100, 100, 100]);
    expect(result.benchmarkIndex).toEqual([100, 100, 100]);
  });

  it("rawMarketValue matches input totalValue", () => {
    const result = computePerformanceSeries(simpleSeries);
    expect(result.rawMarketValue).toEqual([
      100_000, 102_000, 105_000, 107_000, 110_000,
    ]);
  });

  it("dates match input dates", () => {
    const result = computePerformanceSeries(simpleSeries);
    expect(result.dates).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
  });

  // ---- Large series stress --------------------------------------------------

  it("handles a longer series without numerical issues", () => {
    const snapshots: AnalyticsSnapshotPoint[] = [];
    for (let i = 0; i < 100; i++) {
      snapshots.push({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        totalValue: 100_000 * (1 + i * 0.005), // 0.5% per day
        externalCashFlow: i % 10 === 0 ? 5_000 : 0, // every 10 days
        benchmarkClose: 10000 * (1 + i * 0.004),
      });
    }

    const result = computePerformanceSeries(snapshots);

    expect(result.portfolioIndex).toHaveLength(100);
    expect(result.benchmarkIndex).toHaveLength(100);

    // Should all be finite
    for (const v of result.portfolioIndex) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
