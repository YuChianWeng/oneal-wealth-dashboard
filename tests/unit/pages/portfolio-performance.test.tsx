import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseApi } = vi.hoisted(() => ({ mockUseApi: vi.fn() }));

vi.mock("@/lib/hooks/use-api", () => ({ useApi: mockUseApi }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Line: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import PerformancePage from "@/app/portfolio/performance/page";
import { PerformanceChartTooltip } from "@/app/portfolio/performance/chart-tooltip";
import type {
  BenchmarkComparisonViewModel,
  PerformanceBenchmark,
} from "@/lib/analytics";

const primary: PerformanceBenchmark = {
  symbol: "0050.TW" as const,
  name: "元大台灣50" as const,
  basis: "adjusted-close-total-return-proxy" as const,
  freshness: "fresh" as const,
  latestDate: "2026-07-10",
  source: "yfinance" as const,
  sourceVersion: "2026.1",
  fetchedAt: "2026-07-11T01:02:03Z",
  exchangeTimezone: "Asia/Taipei" as const,
  expectedLatestDate: "2026-07-10",
  warnings: [] as string[],
  comparisonStatus: "comparable" as const,
  index: [null, 100, 130],
  observationDates: [null, "2026-06-02", "2026-06-03"],
};

const secondary: PerformanceBenchmark = {
  symbol: "^TWII" as const,
  name: "TAIEX 加權指數" as const,
  basis: "price-index" as const,
  freshness: "stale" as const,
  latestDate: "2026-07-09",
  source: "yfinance" as const,
  sourceVersion: "2026.1",
  fetchedAt: "2026-07-10T01:02:03Z",
  exchangeTimezone: "Asia/Taipei" as const,
  expectedLatestDate: "2026-07-10",
  warnings: ["資料落後預期交易日"] as string[],
  comparisonStatus: "comparable" as const,
  index: [null, 100, 103.4],
  observationDates: [null, "2026-06-02", "2026-06-03"],
};

interface TestPerformanceData {
  dates: string[];
  portfolioIndex: number[];
  portfolioComparisonIndex: Array<number | null>;
  benchmarkIndex: number[];
  rawMarketValue: number[];
  benchmarks: {
    primary: PerformanceBenchmark;
    secondary: PerformanceBenchmark;
  };
  comparison: BenchmarkComparisonViewModel;
  excessReturnVs0050: number | null;
  metadata: {
    benchmarkIndex: {
      status: "deprecated";
      derivation: "snapshot-derived";
      isPrimary: false;
      replacement: "benchmarks.primary";
    };
  };
  audit: {
    method: "modified-dietz-chain-linked-v1";
    eventCount: number;
    inflow: number;
    outflow: number;
    netCashFlow: number;
    events: Array<{ date: string; amount: number; marketValue: number }>;
  };
}

const baseData: TestPerformanceData = {
  dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
  portfolioIndex: [100, 110, 120],
  portfolioComparisonIndex: [null, 100, 107],
  benchmarkIndex: [100, 101, 102],
  rawMarketValue: [100_000, 110_000, 120_000],
  benchmarks: { primary, secondary },
  comparison: {
    status: "measurable" as const,
    startDate: "2026-06-02",
    endDate: "2026-06-03",
    distinctObservationCount: 6,
    portfolioReturnPct: 7,
    primaryReturnPct: 5,
    excessReturnPct: 2,
    winRatePct: 60,
    wins: 3,
    periods: 5,
  },
  excessReturnVs0050: 2,
  metadata: {
    benchmarkIndex: {
      status: "deprecated" as const,
      derivation: "snapshot-derived" as const,
      isPrimary: false as const,
      replacement: "benchmarks.primary" as const,
    },
  },
  audit: {
    method: "modified-dietz-chain-linked-v1" as const,
    eventCount: 0,
    inflow: 0,
    outflow: 0,
    netCashFlow: 0,
    events: [],
  },
};

function renderPage(data: TestPerformanceData = baseData) {
  mockUseApi.mockReturnValue({
    data,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
  return render(<PerformancePage />);
}

function metric(label: string): HTMLElement {
  return screen.getByText(label).parentElement?.parentElement as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Portfolio performance comparison semantics", () => {
  it("uses server comparison metrics and exposes the exact comparison interval", () => {
    renderPage();

    expect(
      within(metric("組合報酬（完整區間）")).getByText("+20.0%"),
    ).toBeTruthy();
    expect(
      within(metric("0050 總報酬（比較區間）")).getByText("+5.0%"),
    ).toBeTruthy();
    expect(
      within(metric("超額報酬 vs 0050（比較區間）")).getByText("+2.0%"),
    ).toBeTruthy();
    expect(
      within(metric("贏率 vs 0050（比較區間）")).getByText("60%（3/5）"),
    ).toBeTruthy();
    expect(
      screen.getAllByText("比較區間：2026-06-02 至 2026-06-03").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText("完整區間：2026-06-01 至 2026-06-03"),
    ).toHaveLength(2);
    expect(screen.getByText(/僅計算 6 個不同觀測日/)).toBeTruthy();
    expect(screen.getByText(/組合同期報酬：\+7\.0%/)).toBeTruthy();
  });

  it("shows em dashes rather than zero percentages when comparison data is insufficient", () => {
    renderPage({
      ...baseData,
      comparison: {
        status: "insufficient-data" as const,
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        distinctObservationCount: 1,
        portfolioReturnPct: null,
        primaryReturnPct: null,
        excessReturnPct: null,
        winRatePct: null,
        wins: 0,
        periods: 0,
      },
    });

    expect(
      within(metric("0050 總報酬（比較區間）")).getByText("—"),
    ).toBeTruthy();
    expect(
      within(metric("超額報酬 vs 0050（比較區間）")).getByText("—"),
    ).toBeTruthy();
    expect(
      within(metric("贏率 vs 0050（比較區間）")).getByText("—"),
    ).toBeTruthy();
    expect(screen.getByText(/觀測資料不足，報酬與贏率不提供/)).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("shows freshness, safe provenance and available-but-not-comparable separately", () => {
    renderPage({
      ...baseData,
      benchmarks: {
        primary,
        secondary: {
          ...secondary,
          comparisonStatus: "not-comparable-at-primary-base" as const,
        },
      },
    });

    const primaryBlock = screen.getByLabelText("元大台灣50 資料來源");
    expect(within(primaryBlock).getByText("最新")).toBeTruthy();
    expect(
      within(primaryBlock).getByText("0050.TW / 調整後收盤價（總報酬代理）"),
    ).toBeTruthy();
    expect(within(primaryBlock).getByText("yfinance / 2026.1")).toBeTruthy();
    expect(within(primaryBlock).getByText("2026-07-11T01:02:03Z")).toBeTruthy();

    const secondaryBlock = screen.getByLabelText("TAIEX 加權指數 資料來源");
    expect(within(secondaryBlock).getByText("資料過期")).toBeTruthy();
    expect(
      within(secondaryBlock).getByText("來源可用，但無法在主要基期比較"),
    ).toBeTruthy();
    expect(within(secondaryBlock).getByText("資料落後預期交易日")).toBeTruthy();
  });

  it("labels a genuinely unavailable benchmark source and keeps provenance deterministic", () => {
    renderPage({
      ...baseData,
      benchmarks: {
        primary,
        secondary: {
          ...secondary,
          freshness: "unavailable" as const,
          latestDate: null,
          expectedLatestDate: null,
          source: null,
          sourceVersion: null,
          fetchedAt: null,
          exchangeTimezone: null,
          warnings: ["Benchmark series unavailable"],
          comparisonStatus: "source-unavailable" as const,
          index: [null, null, null],
          observationDates: [null, null, null],
        },
      },
    });

    const block = screen.getByLabelText("TAIEX 加權指數 資料來源");
    expect(
      within(block).getAllByText("來源不可用").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      within(block).getByText("Benchmark series unavailable"),
    ).toBeTruthy();
    expect(
      within(metric("TAIEX 正規化指數（比較區間）")).getByText("—"),
    ).toBeTruthy();
    expect(screen.queryByText(/NT\$103/)).toBeNull();
  });
});

describe("ChartTooltip", () => {
  it("shows the actual carried-forward benchmark observation date", () => {
    const point = {
      date: "2026-06-08",
      label: "6/8",
      portfolio: 101,
      primaryBenchmark: 102,
      secondaryBenchmark: 103,
      primaryObservationDate: "2026-06-05",
      secondaryObservationDate: "2026-06-06",
      marketValue: 120_000,
    };

    render(
      <PerformanceChartTooltip
        active
        label="6/8"
        payload={[
          {
            name: "primaryBenchmark",
            value: 102,
            color: "gray",
            payload: point,
          },
          {
            name: "secondaryBenchmark",
            value: 103,
            color: "silver",
            payload: point,
          },
        ]}
      />,
    );

    expect(screen.getByText("組合日期 2026-06-08")).toBeTruthy();
    expect(
      screen.getByText("實際觀測日 2026-06-05（沿用至組合日期）"),
    ).toBeTruthy();
    expect(
      screen.getByText("實際觀測日 2026-06-06（沿用至組合日期）"),
    ).toBeTruthy();
    expect(screen.getByText("0050 指數 102.0")).toBeTruthy();
  });
});
