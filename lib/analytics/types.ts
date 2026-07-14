/**
 * Analytics view-model types for the overview dashboard.
 *
 * These types are public (safe for API responses). They aggregate data
 * from finance + portfolio repositories and are consumed by the overview
 * and insights API routes.
 */

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

export interface KpiCard {
  label: string;
  value: number;
  /** Optional prefix (e.g. "$", "NT$") for display */
  prefix?: string;
  /** Optional suffix (e.g. "%", "x") for display */
  suffix?: string;
  /** Change vs previous period as a decimal (e.g. 0.15 = +15%) */
  change: number | null;
  /** Whether a positive change is "good" (default: true) */
  positiveIsGood?: boolean;
}

// ---------------------------------------------------------------------------
// Cash flow
// ---------------------------------------------------------------------------

export interface MonthlyCashFlowPoint {
  month: string;
  income: number;
  expense: number;
  netCashflow: number;
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export interface PerformanceChartData {
  dates: string[];
  portfolioIndex: number[];
  benchmarkIndex: number[];
  rawMarketValue: number[];
}

export interface BenchmarkValuePoint {
  date: string;
  value: number;
}

export interface AlignedBenchmarkSeries {
  /** Base-100 normalized performance index; null means no prior market observation. */
  index: Array<number | null>;
  /** Actual market observation used for each portfolio date, including carry-forward. */
  observationDates: Array<string | null>;
}

export type BenchmarkComparisonStatus = "measurable" | "insufficient-data";

export type SecondaryComparisonStatus =
  | "comparable"
  | "source-unavailable"
  | "not-comparable-at-primary-base";

export interface BenchmarkComparisonViewModel {
  status: BenchmarkComparisonStatus;
  /** Portfolio snapshot where the first distinct primary observation is available. */
  startDate: string | null;
  /** Portfolio snapshot where the last distinct primary observation first becomes available. */
  endDate: string | null;
  distinctObservationCount: number;
  portfolioReturnPct: number | null;
  primaryReturnPct: number | null;
  excessReturnPct: number | null;
  winRatePct: number | null;
  wins: number;
  periods: number;
}

export interface BenchmarkComparisonInput {
  dates: string[];
  portfolioIndex: number[];
  primary: AlignedBenchmarkSeries;
  /** Null means the secondary source is unavailable. */
  secondary: AlignedBenchmarkSeries | null;
}

export interface BenchmarkComparisonResult {
  portfolioIndex: Array<number | null>;
  primaryIndex: Array<number | null>;
  secondaryIndex: Array<number | null>;
  secondaryComparisonStatus: SecondaryComparisonStatus;
  comparison: BenchmarkComparisonViewModel;
}

export interface PerformanceBenchmark extends AlignedBenchmarkSeries {
  symbol: "0050.TW" | "^TWII";
  name: "元大台灣50" | "TAIEX 加權指數";
  basis: "adjusted-close-total-return-proxy" | "price-index";
  freshness: "fresh" | "stale" | "unavailable";
  latestDate: string | null;
  source: "yfinance" | null;
  sourceVersion: string | null;
  fetchedAt: string | null;
  exchangeTimezone: "Asia/Taipei" | null;
  expectedLatestDate: string | null;
  warnings: string[];
  comparisonStatus: SecondaryComparisonStatus;
}

/** Alias — used by portfolio-performance.ts */
export type PerformanceSeriesResult = PerformanceChartData;

/** Enriched snapshot point with optional benchmark and cash-flow data. */
export interface AnalyticsSnapshotPoint {
  date: string;
  totalValue: number;
  benchmarkClose?: number | null;
  externalCashFlow: number;
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

export interface AllocationBucket {
  /** Stable machine ID when the bucket represents a taxonomy dimension. */
  id?: string;
  label: string;
  value: number;
  percentage: number;
}

export interface AllocationResult {
  byStock: AllocationBucket[];
  bySector: AllocationBucket[];
  byIndustry: AllocationBucket[];
  /** Multi-label exposure; percentages may sum above 100%. */
  byTheme: AllocationBucket[];
  byPortfolioRole: AllocationBucket[];
}

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

export interface NetWorthPoint {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface NetWorthSeries {
  points: NetWorthPoint[];
  coverageLabel: string | null;
  totalAccounts: number;
  coveredAccounts: number;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export type InsightSeverity = "info" | "notice" | "action-needed";

export interface Insight {
  id: string;
  insightVersion: string;
  severity: InsightSeverity;
  title: string;
  description: string;
  /** Route to navigate to for more detail (e.g. "/finance/reviews") */
  drillThroughUrl: string;
  /** ISO-8601 timestamp of when the insight was generated */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Overview response
// ---------------------------------------------------------------------------

export interface OverviewResponse {
  kpiCards: KpiCard[];
  allocation: AllocationResult;
  performanceChart: PerformanceChartData;
  monthlyCashFlow: MonthlyCashFlowPoint[];
  insights: Insight[];
}
