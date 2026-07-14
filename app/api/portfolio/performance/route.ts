import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toSafeResponse } from "@/lib/errors";
import { getDailySnapshots } from "@/lib/data/portfolio-repository";
import {
  benchmarkSeries,
  type BenchmarkSeries,
} from "@/lib/data/benchmark-repository";
import {
  alignBenchmarkSeries,
  computeBenchmarkComparison,
  computePerformanceChart,
  type PerformanceBenchmark,
} from "@/lib/analytics";
import type { BenchmarkSymbol } from "@/lib/schemas/benchmark";

const RangeSchema = z.enum(["1M", "3M", "6M", "YTD", "1Y", "ALL"]);
const QuerySchema = z.object({
  range: RangeSchema.optional().default("1Y"),
});

/** GET /api/portfolio/performance?range=1Y */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = QuerySchema.safeParse({
      range: request.nextUrl.searchParams.get("range") ?? "1Y",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          version: 1,
          error: {
            message: "Invalid query parameters",
            code: "VALIDATION_ERROR",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const snapshotsResult = getDailySnapshots(rangeToSince(parsed.data.range));
    const snapshots = snapshotsResult.ok ? snapshotsResult.value : [];
    const chart = computePerformanceChart(snapshots);
    const loadedPrimary = loadBenchmark("0050.TW", chart.dates);
    const loadedSecondary = loadBenchmark("^TWII", chart.dates);
    const comparisonResult = computeBenchmarkComparison({
      dates: chart.dates,
      portfolioIndex: chart.portfolioIndex,
      primary: loadedPrimary,
      secondary: loadedSecondary.source === null ? null : loadedSecondary,
    });
    const portfolioComparisonIndex = comparisonResult.portfolioIndex;
    const primary = {
      ...loadedPrimary,
      index: comparisonResult.primaryIndex,
      comparisonStatus:
        loadedPrimary.source === null
          ? ("source-unavailable" as const)
          : ("comparable" as const),
    };
    const secondary = {
      ...loadedSecondary,
      index: comparisonResult.secondaryIndex,
      comparisonStatus: comparisonResult.secondaryComparisonStatus,
    };
    const cashFlowEvents = snapshots
      .filter((snapshot) => snapshot.externalCashFlow !== 0)
      .map((snapshot) => ({
        date: snapshot.date,
        amount: snapshot.externalCashFlow,
        marketValue: snapshot.totalValue,
      }));
    const inflow = cashFlowEvents
      .filter((event) => event.amount > 0)
      .reduce((sum, event) => sum + event.amount, 0);
    const outflow = cashFlowEvents
      .filter((event) => event.amount < 0)
      .reduce((sum, event) => sum + event.amount, 0);

    return NextResponse.json(
      {
        version: 1,
        data: {
          ...chart,
          portfolioComparisonIndex,
          benchmarks: { primary, secondary },
          comparison: comparisonResult.comparison,
          excessReturnVs0050: comparisonResult.comparison.excessReturnPct,
          metadata: {
            benchmarkIndex: {
              status: "deprecated",
              derivation: "snapshot-derived",
              isPrimary: false,
              replacement: "benchmarks.primary",
            },
          },
          audit: {
            method: "modified-dietz-chain-linked-v1",
            eventCount: cashFlowEvents.length,
            inflow,
            outflow,
            netCashFlow: inflow + outflow,
            events: cashFlowEvents,
          },
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    const safe = toSafeResponse(error);
    return NextResponse.json(
      { version: 1, error: safe },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}

function loadBenchmark(
  symbol: BenchmarkSymbol,
  portfolioDates: string[],
): PerformanceBenchmark {
  const result = benchmarkSeries(symbol);
  if (!result.ok) return unavailableBenchmark(symbol, portfolioDates);

  const series: BenchmarkSeries = result.value;
  const aligned = alignBenchmarkSeries(
    portfolioDates,
    series.points.map((point) => ({
      date: point.date,
      value: symbol === "0050.TW" ? point.adjustedClose : point.close,
    })),
  );

  return {
    symbol,
    name: series.name,
    basis: series.basis,
    freshness: series.freshness,
    latestDate: series.latestDate,
    source: series.source,
    sourceVersion: series.sourceVersion,
    fetchedAt: series.fetchedAt,
    exchangeTimezone: series.exchangeTimezone,
    expectedLatestDate: series.expectedLatestDate,
    warnings: series.warnings,
    comparisonStatus: "comparable",
    ...aligned,
  };
}

function unavailableBenchmark(
  symbol: BenchmarkSymbol,
  portfolioDates: string[],
): PerformanceBenchmark {
  const unavailableAlignment = {
    index: portfolioDates.map(() => null),
    observationDates: portfolioDates.map(() => null),
  };
  return symbol === "0050.TW"
    ? {
        symbol,
        name: "元大台灣50",
        basis: "adjusted-close-total-return-proxy",
        freshness: "unavailable",
        latestDate: null,
        source: null,
        sourceVersion: null,
        fetchedAt: null,
        exchangeTimezone: null,
        expectedLatestDate: null,
        warnings: ["Benchmark series unavailable"],
        comparisonStatus: "source-unavailable",
        ...unavailableAlignment,
      }
    : {
        symbol,
        name: "TAIEX 加權指數",
        basis: "price-index",
        freshness: "unavailable",
        latestDate: null,
        source: null,
        sourceVersion: null,
        fetchedAt: null,
        exchangeTimezone: null,
        expectedLatestDate: null,
        warnings: ["Benchmark series unavailable"],
        comparisonStatus: "source-unavailable",
        ...unavailableAlignment,
      };
}

function rangeToSince(range: z.infer<typeof RangeSchema>): string {
  const now = new Date();
  switch (range) {
    case "1M": {
      const date = new Date(now);
      date.setMonth(date.getMonth() - 1);
      return date.toISOString().slice(0, 10);
    }
    case "3M": {
      const date = new Date(now);
      date.setMonth(date.getMonth() - 3);
      return date.toISOString().slice(0, 10);
    }
    case "6M": {
      const date = new Date(now);
      date.setMonth(date.getMonth() - 6);
      return date.toISOString().slice(0, 10);
    }
    case "YTD":
      return `${now.getFullYear()}-01-01`;
    case "1Y": {
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - 1);
      return date.toISOString().slice(0, 10);
    }
    case "ALL":
    default:
      return "2000-01-01";
  }
}
