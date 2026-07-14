/**
 * Tests for GET /api/portfolio/performance
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDailySnapshots, mockBenchmarkSeries } = vi.hoisted(() => ({
  mockGetDailySnapshots: vi.fn(),
  mockBenchmarkSeries: vi.fn(),
}));

import { NextRequest } from "next/server";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/portfolio-repository", () => ({
  getDailySnapshots: mockGetDailySnapshots,
  listOpenPositions: vi.fn(),
}));
vi.mock("@/lib/data/benchmark-repository", () => ({
  benchmarkSeries: mockBenchmarkSeries,
}));

import { GET } from "@/app/api/portfolio/performance/route";
import { ok, err } from "@/lib/result";
import { SourceError } from "@/lib/errors";

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

const sampleSnapshots = [
  {
    date: "2026-06-30",
    totalValue: 800000,
    externalCashFlow: 0,
    benchmarkClose: 1000,
  },
  {
    date: "2026-07-01",
    totalValue: 810000,
    externalCashFlow: 0,
    benchmarkClose: 900,
  },
  {
    date: "2026-07-07",
    totalValue: 820000,
    externalCashFlow: 0,
    benchmarkClose: 1100,
  },
];

function benchmark(symbol: "0050.TW" | "^TWII") {
  return {
    version: 1 as const,
    symbol,
    name: symbol === "0050.TW" ? "元大台灣50" : "TAIEX 加權指數",
    basis:
      symbol === "0050.TW"
        ? ("adjusted-close-total-return-proxy" as const)
        : ("price-index" as const),
    currency: "TWD" as const,
    exchangeTimezone: "Asia/Taipei" as const,
    source: "yfinance" as const,
    sourceVersion: "test",
    fetchedAt: "2026-07-07T15:00:00+08:00",
    points: [
      { date: "2026-06-30", close: 100, adjustedClose: 90, volume: 1000 },
      { date: "2026-07-01", close: 101, adjustedClose: 92, volume: 1000 },
      { date: "2026-07-07", close: 102, adjustedClose: 95, volume: 1000 },
    ],
    latestDate: "2026-07-07",
    expectedLatestDate: "2026-07-07",
    freshness: "fresh" as const,
    warnings: [],
  };
}

describe("GET /api/portfolio/performance", () => {
  beforeEach(() => {
    mockGetDailySnapshots.mockReset();
    mockBenchmarkSeries.mockReset();
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      ok(benchmark(symbol)),
    );
  });

  it("returns 0050 adjusted total return as primary and TAIEX as secondary", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance?range=1Y"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.dates).toHaveLength(3);
    expect(body.data.portfolioIndex).toHaveLength(3);
    expect(body.data.portfolioIndex[0]).toBe(100);
    expect(body.data.rawMarketValue).toEqual([800000, 810000, 820000]);
    expect(body.data.benchmarks.primary).toMatchObject({
      symbol: "0050.TW",
      basis: "adjusted-close-total-return-proxy",
      source: "yfinance",
      sourceVersion: "test",
      fetchedAt: "2026-07-07T15:00:00+08:00",
      exchangeTimezone: "Asia/Taipei",
      expectedLatestDate: "2026-07-07",
      observationDates: ["2026-06-30", "2026-07-01", "2026-07-07"],
    });
    expect(body.data.benchmarks.primary.index[0]).toBe(100);
    expect(body.data.benchmarks.primary.index[1]).toBeCloseTo((92 / 90) * 100);
    expect(body.data.benchmarks.primary.index[2]).toBeCloseTo((95 / 90) * 100);
    expect(body.data.benchmarks.secondary).toMatchObject({
      symbol: "^TWII",
      basis: "price-index",
      source: "yfinance",
      sourceVersion: "test",
      fetchedAt: "2026-07-07T15:00:00+08:00",
      exchangeTimezone: "Asia/Taipei",
      expectedLatestDate: "2026-07-07",
      index: [100, 101, 102],
    });
    expect(body.data.excessReturnVs0050).toBeCloseTo(
      (820000 / 800000 - 1) * 100 - (95 / 90 - 1) * 100,
    );
    expect(body.data.excessReturnVs0050).toBe(
      body.data.comparison.excessReturnPct,
    );
    expect(body.data.comparison).toMatchObject({
      status: "measurable",
      startDate: "2026-06-30",
      endDate: "2026-07-07",
      distinctObservationCount: 3,
      wins: 0,
      periods: 2,
    });
    expect(body.data.benchmarkIndex[0]).toBe(100);
    expect(body.data.benchmarkIndex[1]).toBe(90);
    expect(body.data.benchmarkIndex[2]).toBeCloseTo(110);
    expect(body.data.benchmarkIndex).not.toEqual(
      body.data.benchmarks.primary.index,
    );
    expect(body.data.benchmarkIndex).not.toEqual(
      body.data.benchmarks.secondary.index,
    );
    expect(body.data.metadata.benchmarkIndex).toEqual({
      status: "deprecated",
      derivation: "snapshot-derived",
      isPrimary: false,
      replacement: "benchmarks.primary",
    });
    expect(mockBenchmarkSeries).toHaveBeenCalledWith("0050.TW");
    expect(mockBenchmarkSeries).toHaveBeenCalledWith("^TWII");
  });

  it("returns 200 with empty arrays for no snapshots", async () => {
    mockGetDailySnapshots.mockReturnValue(ok([]));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.dates).toEqual([]);
    expect(body.data.portfolioIndex).toEqual([]);
    expect(body.data.portfolioComparisonIndex).toEqual([]);
    expect(body.data.benchmarks.primary.index).toEqual([]);
    expect(body.data.benchmarks.primary.observationDates).toEqual([]);
    expect(body.data.benchmarks.secondary.index).toEqual([]);
    expect(body.data.benchmarks.secondary.observationDates).toEqual([]);
    expect(body.data.benchmarks.primary.symbol).toBe("0050.TW");
    expect(body.data.comparison).toEqual({
      status: "insufficient-data",
      startDate: null,
      endDate: null,
      distinctObservationCount: 0,
      portfolioReturnPct: null,
      primaryReturnPct: null,
      excessReturnPct: null,
      winRatePct: null,
      wins: 0,
      periods: 0,
    });
  });

  it("returns 400 for invalid range", async () => {
    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance?range=INVALID"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 200 with default range (1Y) when not specified", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.status).toBe(200);
  });

  it("keeps successfully loaded benchmarks usable when freshness cannot be evaluated", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      ok({
        ...benchmark(symbol),
        freshness: "unavailable" as const,
        expectedLatestDate: null,
        warnings: [
          "Benchmark freshness unavailable outside verified TWSE calendar coverage",
        ],
      }),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();

    expect(body.data.comparison.status).toBe("measurable");
    expect(body.data.benchmarks.primary).toMatchObject({
      freshness: "unavailable",
      source: "yfinance",
      comparisonStatus: "comparable",
    });
    expect(body.data.benchmarks.secondary).toMatchObject({
      freshness: "unavailable",
      source: "yfinance",
      comparisonStatus: "comparable",
    });
    expect(body.data.benchmarks.primary.index).toHaveLength(sampleSnapshots.length);
    expect(body.data.benchmarks.secondary.index).toHaveLength(sampleSnapshots.length);
    expect(body.data.benchmarks.secondary.index.some((value: number | null) => value !== null)).toBe(true);
  });

  it("handles snapshot repository errors gracefully", async () => {
    mockGetDailySnapshots.mockReturnValue(
      err(new SourceError("Vault error", "SOURCE_ERROR")),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.status).toBe(200);
  });

  it("has Cache-Control: private, no-store", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("never future-fills a missing first benchmark observation", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    const primary = benchmark("0050.TW");
    primary.points = primary.points.slice(1);
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      ok(symbol === "0050.TW" ? primary : benchmark(symbol)),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();

    expect(body.data.portfolioComparisonIndex[0]).toBeNull();
    expect(body.data.benchmarks.primary.index[0]).toBeNull();
    expect(body.data.benchmarks.primary.observationDates[0]).toBeNull();
  });

  it("uses the first shared 0050 date as the common comparison base", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    const primary = benchmark("0050.TW");
    primary.points = primary.points.slice(1);
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      ok(symbol === "0050.TW" ? primary : benchmark(symbol)),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();

    expect(body.data.portfolioIndex).toEqual([100, 101.25, 102.5]);
    expect(body.data.portfolioComparisonIndex[0]).toBeNull();
    expect(body.data.portfolioComparisonIndex[1]).toBe(100);
    expect(body.data.portfolioComparisonIndex[2]).toBeCloseTo((820 / 810) * 100);
    expect(body.data.benchmarks.primary.index[0]).toBeNull();
    expect(body.data.benchmarks.primary.index[1]).toBe(100);
    expect(body.data.benchmarks.primary.index[2]).toBeCloseTo((95 / 92) * 100);
    expect(body.data.benchmarks.secondary.index[0]).toBeNull();
    expect(body.data.benchmarks.secondary.index[1]).toBe(100);
    expect(body.data.benchmarks.secondary.index[2]).toBeCloseTo((102 / 101) * 100);
    expect(body.data.excessReturnVs0050).toBeCloseTo(
      (820 / 810 - 1) * 100 - (95 / 92 - 1) * 100,
    );
  });

  it("returns partial benchmark metadata without leaking repository errors", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      symbol === "0050.TW"
        ? err(
            new SourceError(
              "private /vault/path",
              "BENCHMARK_SOURCE_UNAVAILABLE",
            ),
          )
        : ok(benchmark(symbol)),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(serialized).toContain('"symbol":"0050.TW"');
    expect(body.data.benchmarks.primary.index).toEqual([null, null, null]);
    expect(body.data.benchmarks.primary.observationDates).toEqual([
      null,
      null,
      null,
    ]);
    expect(body.data.benchmarks.primary.comparisonStatus).toBe(
      "source-unavailable",
    );
    expect(serialized).not.toContain("/vault/path");
    expect(serialized).not.toContain(".md");
    expect(body.data.benchmarks.primary).toMatchObject({
      source: null,
      sourceVersion: null,
      fetchedAt: null,
      exchangeTimezone: null,
      expectedLatestDate: null,
    });
    expect(body.data.benchmarks.secondary).toMatchObject({
      source: "yfinance",
      sourceVersion: "test",
      fetchedAt: "2026-07-07T15:00:00+08:00",
      exchangeTimezone: "Asia/Taipei",
      expectedLatestDate: "2026-07-07",
    });
  });

  it("returns deterministic safe provenance when both sources are unavailable", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      err(
        new SourceError(
          `private /vault/${symbol}.json`,
          "BENCHMARK_SOURCE_UNAVAILABLE",
        ),
      ),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();
    const safeUnavailableProvenance = {
      source: null,
      sourceVersion: null,
      fetchedAt: null,
      exchangeTimezone: null,
      expectedLatestDate: null,
    };

    expect(body.data.benchmarks.primary).toMatchObject(
      safeUnavailableProvenance,
    );
    expect(body.data.benchmarks.secondary).toMatchObject(
      safeUnavailableProvenance,
    );
    expect(body.data.benchmarks.primary.index).toEqual([null, null, null]);
    expect(body.data.benchmarks.secondary.index).toEqual([null, null, null]);
    expect(body.data.comparison).toMatchObject({
      status: "insufficient-data",
      distinctObservationCount: 0,
      portfolioReturnPct: null,
      primaryReturnPct: null,
      excessReturnPct: null,
      winRatePct: null,
      wins: 0,
      periods: 0,
    });
    expect(JSON.stringify(body)).not.toContain("/vault/");
  });

  it("does not measure one primary observation carried across many snapshots", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    const primary = benchmark("0050.TW");
    primary.points = [primary.points[0]];
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      ok(symbol === "0050.TW" ? primary : benchmark(symbol)),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();

    expect(body.data.comparison).toEqual({
      status: "insufficient-data",
      startDate: "2026-06-30",
      endDate: "2026-06-30",
      distinctObservationCount: 1,
      portfolioReturnPct: null,
      primaryReturnPct: null,
      excessReturnPct: null,
      winRatePct: null,
      wins: 0,
      periods: 0,
    });
    expect(body.data.excessReturnVs0050).toBeNull();
  });

  it("keeps a later-starting secondary null at the primary comparison base", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));
    const secondary = benchmark("^TWII");
    secondary.points = secondary.points.slice(1);
    mockBenchmarkSeries.mockImplementation((symbol: "0050.TW" | "^TWII") =>
      ok(symbol === "^TWII" ? secondary : benchmark(symbol)),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    const body = await response.json();

    expect(body.data.benchmarks.secondary.comparisonStatus).toBe(
      "not-comparable-at-primary-base",
    );
    expect(body.data.benchmarks.secondary.index).toEqual([null, null, null]);
  });
});
