/**
 * Analytics barrel — public API for computing dashboard metrics.
 *
 * All functions are pure; they accept validated view-model inputs and
 * return derived metrics. No repository access, no file I/O.
 */

export { computeKpis } from "./kpis";
export { computeCashFlow } from "./cashflow";
export { computePerformanceChart } from "./performance";
export {
  alignBenchmarkSeries,
  computeBenchmarkComparison,
  computePerformanceSeries,
} from "./portfolio-performance";
export { generateInsights } from "./insights";
export { computePnlAnalytics } from "./pnl";
export {
  computeAllocationByStock,
  computeAllocationBySector,
  computeAllocationByTheme,
  computeAllocationBreakdown,
} from "./allocation";
export {
  emergencyFundMonths,
  savingsRate,
  debtRatio,
  concentrationRisk,
} from "./financial-health";
export {
  computeNetWorth,
  latestNetWorth,
  isCoverageSufficient,
} from "./net-worth";
export type {
  KpiCard,
  MonthlyCashFlowPoint,
  PerformanceChartData,
  PerformanceSeriesResult,
  AnalyticsSnapshotPoint,
  AlignedBenchmarkSeries,
  BenchmarkComparisonInput,
  BenchmarkComparisonResult,
  BenchmarkComparisonStatus,
  BenchmarkComparisonViewModel,
  BenchmarkValuePoint,
  PerformanceBenchmark,
  SecondaryComparisonStatus,
  AllocationBucket,
  AllocationResult,
  NetWorthPoint,
  NetWorthSeries,
  Insight,
  InsightSeverity,
  OverviewResponse,
} from "./types";
export type {
  PnlAggregate,
  PnlAnalytics,
  PnlAnalyticsInput,
  PnlAvailability,
  PnlBySymbol,
} from "./pnl";
