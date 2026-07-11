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
  label: string;
  value: number;
  percentage: number;
}

export interface AllocationResult {
  byStock: AllocationBucket[];
  bySector: AllocationBucket[];
  byTheme: AllocationBucket[];
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
