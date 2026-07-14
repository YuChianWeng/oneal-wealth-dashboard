/**
 * Tests for portfolio-performance.ts — position-neutral time-series returns.
 */

import { describe, expect, it } from "vitest";
import {
  alignBenchmarkSeries,
  computeBenchmarkComparison,
  computePerformanceSeries,
} from "@/lib/analytics/portfolio-performance";
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

describe("alignBenchmarkSeries", () => {
  it("uses the latest observation on or before each portfolio date and exposes carry-forward dates", () => {
    const result = alignBenchmarkSeries(
      ["2026-04-02", "2026-04-03", "2026-04-06"],
      [
        { date: "2026-04-02", value: 100 },
        { date: "2026-04-06", value: 105 },
      ],
    );

    expect(result.index).toEqual([100, 100, 105]);
    expect(result.observationDates).toEqual([
      "2026-04-02",
      "2026-04-02",
      "2026-04-06",
    ]);
  });

  it("does not future-fill when the first benchmark observation is later", () => {
    const result = alignBenchmarkSeries(
      ["2026-04-01", "2026-04-02", "2026-04-03"],
      [
        { date: "2026-04-02", value: 200 },
        { date: "2026-04-03", value: 204 },
      ],
    );

    expect(result.index).toEqual([null, 100, 102]);
    expect(result.observationDates).toEqual([null, "2026-04-02", "2026-04-03"]);
  });

  it("normalizes different source dates to the same first portfolio observation date", () => {
    const portfolioDates = ["2026-04-06", "2026-04-07"];
    const primary = alignBenchmarkSeries(portfolioDates, [
      { date: "2026-04-02", value: 50 },
      { date: "2026-04-07", value: 55 },
    ]);
    const secondary = alignBenchmarkSeries(portfolioDates, [
      { date: "2026-04-06", value: 20_000 },
      { date: "2026-04-07", value: 21_000 },
    ]);

    expect(primary.index[0]).toBe(100);
    expect(primary.index[1]).toBeCloseTo(110);
    expect(secondary.index[0]).toBe(100);
    expect(secondary.index[1]).toBeCloseTo(105);
    expect(primary.observationDates[0]).toBe("2026-04-02");
    expect(secondary.observationDates[0]).toBe("2026-04-06");
  });

  it("uses adjusted values so a dividend adjustment is reflected in total return", () => {
    const result = alignBenchmarkSeries(
      ["2026-04-01", "2026-04-02"],
      [
        { date: "2026-04-01", value: 100 },
        { date: "2026-04-02", value: 104 },
      ],
    );

    expect(result.index).toEqual([100, 104]);
  });

  it("keeps partial benchmark history explicit", () => {
    const result = alignBenchmarkSeries(
      ["2026-04-01", "2026-04-02", "2026-04-03"],
      [{ date: "2026-04-02", value: 10 }],
    );

    expect(result.index).toEqual([null, 100, 100]);
    expect(result.observationDates).toEqual([null, "2026-04-02", "2026-04-02"]);
  });

  it("returns aligned null arrays for empty or wholly invalid benchmark points", () => {
    const dates = [
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
    ];
    expect(alignBenchmarkSeries(dates, [])).toEqual({
      index: [null, null, null, null],
      observationDates: [null, null, null, null],
    });
    expect(
      alignBenchmarkSeries(dates, [
        { date: "2026-04-01", value: 0 },
        { date: "2026-04-02", value: -1 },
        { date: "2026-04-03", value: Number.NaN },
        { date: "2026-04-04", value: Number.POSITIVE_INFINITY },
      ]),
    ).toEqual({
      index: [null, null, null, null],
      observationDates: [null, null, null, null],
    });
  });

  it.each([
    {
      label: "out-of-order portfolio dates",
      dates: ["2026-04-02", "2026-04-01"],
      points: [{ date: "2026-04-01", value: 100 }],
    },
    {
      label: "duplicate portfolio dates",
      dates: ["2026-04-01", "2026-04-01"],
      points: [{ date: "2026-04-01", value: 100 }],
    },
    {
      label: "out-of-order benchmark dates",
      dates: ["2026-04-01", "2026-04-02"],
      points: [
        { date: "2026-04-02", value: 101 },
        { date: "2026-04-01", value: 100 },
      ],
    },
    {
      label: "duplicate benchmark dates",
      dates: ["2026-04-01", "2026-04-02"],
      points: [
        { date: "2026-04-01", value: 100 },
        { date: "2026-04-01", value: 101 },
      ],
    },
  ])("throws for $label", ({ dates, points }) => {
    expect(() => alignBenchmarkSeries(dates, points)).toThrow(
      /strictly increasing/,
    );
  });
});

describe("computeBenchmarkComparison", () => {
  it("requires two distinct primary observations even when one is carried forward", () => {
    const result = computeBenchmarkComparison({
      dates: ["2026-04-01", "2026-04-02", "2026-04-03"],
      portfolioIndex: [100, 101, 102],
      primary: {
        index: [100, 100, 100],
        observationDates: ["2026-04-01", "2026-04-01", "2026-04-01"],
      },
      secondary: null,
    });

    expect(result.comparison).toEqual({
      status: "insufficient-data",
      startDate: "2026-04-01",
      endDate: "2026-04-01",
      distinctObservationCount: 1,
      portfolioReturnPct: null,
      primaryReturnPct: null,
      excessReturnPct: null,
      winRatePct: null,
      wins: 0,
      periods: 0,
    });
    expect(result.portfolioIndex).toEqual([100, null, null]);
    expect(result.primaryIndex).toEqual([100, null, null]);
  });

  it("does not extend returns through stale trailing carry-forward snapshots", () => {
    const result = computeBenchmarkComparison({
      dates: ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"],
      portfolioIndex: [100, 102, 104, 110],
      primary: {
        index: [100, 102, 102, 102],
        observationDates: [
          "2026-04-01",
          "2026-04-02",
          "2026-04-02",
          "2026-04-02",
        ],
      },
      secondary: {
        index: [100, 101, 101, 101],
        observationDates: [
          "2026-04-01",
          "2026-04-02",
          "2026-04-02",
          "2026-04-02",
        ],
      },
    });

    expect(result.comparison.endDate).toBe("2026-04-02");
    expect(result.comparison.portfolioReturnPct).toBeCloseTo(2);
    expect(result.comparison.primaryReturnPct).toBeCloseTo(2);
    expect(result.comparison.excessReturnPct).toBeCloseTo(0);
    expect(result.portfolioIndex).toEqual([100, 102, null, null]);
    expect(result.primaryIndex).toEqual([100, 102, null, null]);
    expect(result.secondaryIndex).toEqual([100, 101, null, null]);
  });

  it("uses matching Friday-to-Monday observation checkpoints for win rate and treats ties as non-wins", () => {
    const result = computeBenchmarkComparison({
      dates: ["2026-04-03", "2026-04-04", "2026-04-05", "2026-04-06", "2026-04-07"],
      portfolioIndex: [100, 110, 120, 106, 108.12],
      primary: {
        index: [100, 100, 100, 105, 107.1],
        observationDates: [
          "2026-04-03",
          "2026-04-03",
          "2026-04-03",
          "2026-04-06",
          "2026-04-07",
        ],
      },
      secondary: null,
    });

    expect(result.comparison).toMatchObject({
      distinctObservationCount: 3,
      wins: 1,
      periods: 2,
      winRatePct: 50,
    });
  });

  it("counts a tied observation interval as a period but not a win", () => {
    const result = computeBenchmarkComparison({
      dates: ["2026-04-01", "2026-04-02"],
      portfolioIndex: [100, 105],
      primary: {
        index: [100, 105],
        observationDates: ["2026-04-01", "2026-04-02"],
      },
      secondary: null,
    });

    expect(result.comparison).toMatchObject({
      status: "measurable",
      wins: 0,
      periods: 1,
      winRatePct: 0,
    });
  });

  it("returns insufficient data for a single portfolio snapshot", () => {
    const result = computeBenchmarkComparison({
      dates: ["2026-04-01"],
      portfolioIndex: [100],
      primary: { index: [100], observationDates: ["2026-04-01"] },
      secondary: null,
    });
    expect(result.comparison.status).toBe("insufficient-data");
    expect(result.comparison.winRatePct).toBeNull();
  });

  it("does not rebase a secondary series that starts after the primary base", () => {
    const result = computeBenchmarkComparison({
      dates: ["2026-04-01", "2026-04-02", "2026-04-03"],
      portfolioIndex: [100, 101, 102],
      primary: {
        index: [100, 101, 102],
        observationDates: ["2026-04-01", "2026-04-02", "2026-04-03"],
      },
      secondary: {
        index: [null, 100, 101],
        observationDates: [null, "2026-04-02", "2026-04-03"],
      },
    });

    expect(result.secondaryComparisonStatus).toBe(
      "not-comparable-at-primary-base",
    );
    expect(result.secondaryIndex).toEqual([null, null, null]);
  });
});
