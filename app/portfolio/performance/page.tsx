"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useApi } from "@/lib/hooks/use-api";
import { formatTWD, formatPercent } from "@/lib/format";
import type {
  BenchmarkComparisonViewModel,
  PerformanceBenchmark,
} from "@/lib/analytics";
import {
  PerformanceChartTooltip,
  type PerformanceChartPoint,
} from "./chart-tooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceResponse {
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

type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length >= 3) {
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }
  return iso;
}

function computeReturn(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

function computeMaxDrawdown(values: number[]): number {
  if (values.length === 0) return 0;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (v - peak) / (peak || 1);
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

// ---------------------------------------------------------------------------
// Chart data builder
// ---------------------------------------------------------------------------

function buildChartData(data: PerformanceResponse): PerformanceChartPoint[] {
  return data.dates.map((date, index) => ({
    date,
    label: formatDateLabel(date),
    portfolio: data.portfolioComparisonIndex[index] ?? null,
    primaryBenchmark: data.benchmarks.primary.index[index] ?? null,
    secondaryBenchmark: data.benchmarks.secondary.index[index] ?? null,
    primaryObservationDate:
      data.benchmarks.primary.observationDates[index] ?? null,
    secondaryObservationDate:
      data.benchmarks.secondary.observationDates[index] ?? null,
    marketValue: data.rawMarketValue[index] ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "6M", label: "6M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "All" },
];

export default function PerformancePage() {
  const [range, setRange] = useState<RangeKey>("1Y");

  const { data, error, isLoading, mutate } = useApi<PerformanceResponse>(
    `/api/portfolio/performance?range=${range}`,
  );

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "績效比較" }}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={100} />
          ))}
        </div>
        <Skeleton height={350} />
        <Skeleton height={250} />
      </AppShell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "績效比較" }}>
        <ErrorState
          message={error?.message ?? "無法載入績效資料"}
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────
  if (data.dates.length === 0) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "績效比較" }}>
        <div className="mb-4 flex items-center justify-end">
          <RangeSelector value={range} onChange={setRange} />
        </div>
        <EmptyState
          title="尚無績效資料"
          description="此時間範圍內尚無快照資料。請確認已建立每日持倉快照。"
        />
      </AppShell>
    );
  }

  // ── Derived metrics ───────────────────────────────────────────────────
  const chartData = buildChartData(data);
  const portfolioReturn = computeReturn(data.portfolioIndex);
  const maxDrawdown = computeMaxDrawdown(data.portfolioIndex);
  const comparison = data.comparison;
  const comparisonMeasurable = comparison.status === "measurable";
  const comparisonInterval =
    comparison.startDate && comparison.endDate
      ? `${comparison.startDate} 至 ${comparison.endDate}`
      : "不可用";
  const fullInterval = `${data.dates[0]} 至 ${data.dates[data.dates.length - 1]}`;
  const secondaryLatestIndex =
    data.benchmarks.secondary.comparisonStatus === "comparable"
      ? ([...data.benchmarks.secondary.index]
          .reverse()
          .find((value): value is number => value !== null) ?? null)
      : null;

  const hasPrimaryBenchmark = data.benchmarks.primary.index.some(
    (value) => value !== null,
  );
  const hasSecondaryBenchmark = data.benchmarks.secondary.index.some(
    (value) => value !== null,
  );
  const latestMv =
    data.rawMarketValue.length > 0
      ? data.rawMarketValue[data.rawMarketValue.length - 1]
      : 0;
  const audit = data.audit;

  return (
    <AppShell navSections={stubNavSections} topbar={{ title: "績效比較" }}>
      {/* ── Range selector ──────────────────────────────────────── */}
      <div className="flex items-center justify-end">
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* ── KPI cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="組合報酬（完整區間）"
          value={formatPercent(portfolioReturn, true)}
          trend={portfolioReturn >= 0 ? "up" : "down"}
          description={`完整區間：${fullInterval}`}
        />
        <MetricCard
          label="0050 總報酬（比較區間）"
          value={
            comparisonMeasurable && comparison.primaryReturnPct != null
              ? formatPercent(comparison.primaryReturnPct, true)
              : "—"
          }
          trend={
            !comparisonMeasurable || comparison.primaryReturnPct == null
              ? "neutral"
              : comparison.primaryReturnPct >= 0
                ? "up"
                : "down"
          }
          description={`比較區間：${comparisonInterval}`}
        />
        <MetricCard
          label="超額報酬 vs 0050（比較區間）"
          value={
            comparisonMeasurable && comparison.excessReturnPct != null
              ? formatPercent(comparison.excessReturnPct, true)
              : "—"
          }
          trend={
            !comparisonMeasurable || comparison.excessReturnPct == null
              ? "neutral"
              : comparison.excessReturnPct >= 0
                ? "up"
                : "down"
          }
          description={`比較區間：${comparisonInterval}`}
        />
        <MetricCard
          label="最大回撤（完整區間）"
          value={formatPercent(maxDrawdown, true)}
          trend="down"
          description={`完整區間：${fullInterval}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="贏率 vs 0050（比較區間）"
          value={
            comparisonMeasurable && comparison.winRatePct != null
              ? `${comparison.winRatePct.toFixed(0)}%（${comparison.wins}/${comparison.periods}）`
              : "—"
          }
          trend={
            !comparisonMeasurable || comparison.winRatePct == null
              ? "neutral"
              : comparison.winRatePct >= 50
                ? "up"
                : "down"
          }
          description={`比較區間：${comparisonInterval}；僅計算 ${comparison.distinctObservationCount} 個不同觀測日`}
        />
        <MetricCard
          label="TAIEX 正規化指數（比較區間）"
          value={
            secondaryLatestIndex != null ? secondaryLatestIndex.toFixed(1) : "—"
          }
          trend="neutral"
          description={`比較狀態：${comparisonStatusLabel(data.benchmarks.secondary.comparisonStatus)}；指數以 100 為共同基期，非新台幣`}
        />
      </div>

      {/* ── Portfolio vs Benchmark line chart ────────────────────── */}
      <Card
        header={
          <div>
            <h2 className="text-[15px] font-semibold">
              組合 vs 0050 正規化指數（TAIEX 次要參考）
            </h2>
            <p className="mt-1 text-[11px] font-normal text-dashboard-faint">
              比較區間：{comparisonInterval}；共同基期指數 = 100；組合同期報酬：
              {comparisonMeasurable && comparison.portfolioReturnPct != null
                ? formatPercent(comparison.portfolioReturnPct, true)
                : "—"}
            </p>
          </div>
        }
      >
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--color-faint)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-faint)" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Tooltip content={<PerformanceChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: "12px", color: "var(--color-muted)" }}
              />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="portfolio"
                stroke="var(--color-accent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              {hasPrimaryBenchmark && (
                <Line
                  type="monotone"
                  dataKey="primaryBenchmark"
                  name="primaryBenchmark"
                  stroke="var(--color-muted)"
                  strokeWidth={1.8}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                />
              )}
              {hasSecondaryBenchmark && (
                <Line
                  type="monotone"
                  dataKey="secondaryBenchmark"
                  name="secondaryBenchmark"
                  stroke="var(--color-faint)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        header={
          <div>
            <h2 className="text-[15px] font-semibold">基準資料狀態與來源</h2>
            <p className="mt-1 text-[11px] font-normal text-dashboard-faint">
              比較計算狀態：
              {comparisonMeasurable
                ? "可衡量"
                : "觀測資料不足，報酬與贏率不提供"}
            </p>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <BenchmarkProvenance
            benchmark={data.benchmarks.primary}
            role="主要基準"
          />
          <BenchmarkProvenance
            benchmark={data.benchmarks.secondary}
            role="次要參考"
          />
        </div>
      </Card>

      {/* ── Market value area chart ──────────────────────────────── */}
      <Card
        header={
          <h2 className="text-[15px] font-semibold">
            持倉市值
            <span className="ml-2 font-normal text-[12px] text-dashboard-faint">
              最新: {formatTWD(latestMv)}
            </span>
          </h2>
        }
      >
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                strokeOpacity={0.4}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--color-faint)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-faint)" }}
                tickLine={false}
                axisLine={false}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => {
                  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                  return v.toString();
                }}
              />
              <Tooltip content={<PerformanceChartTooltip />} />
              <Area
                type="monotone"
                dataKey="marketValue"
                name="marketValue"
                stroke="var(--color-accent)"
                fill="var(--color-accent)"
                fillOpacity={0.08}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ── External cash flow audit ─────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">外部現金流審計</h2>
            <span className="font-mono text-[11px] text-dashboard-faint">
              {audit.eventCount} 個事件
            </span>
          </div>
        }
      >
        <p className="text-[12px] leading-relaxed text-dashboard-faint">
          本績效計算已扣除外部現金流（入金 /
          出金）的影響。買入新股或增持不會虛增報酬，賣出持股不會虛降報酬。計算採用
          Modified Dietz 方法進行期間鏈接。
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AuditMetric label="外部流入" value={audit.inflow} positive />
          <AuditMetric label="外部流出" value={audit.outflow} />
          <AuditMetric
            label="淨外部現金流"
            value={audit.netCashFlow}
            positive={audit.netCashFlow >= 0}
          />
        </div>
        {audit.events.length === 0 ? (
          <p className="mt-4 text-[12px] text-dashboard-faint">
            本期間未記錄外部現金流。
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto border-t border-dashboard-border pt-3">
            <table className="w-full min-w-[480px] text-left text-[12px]">
              <thead className="text-dashboard-faint">
                <tr>
                  <th className="py-2 font-medium">日期</th>
                  <th className="py-2 text-right font-medium">外部現金流</th>
                  <th className="py-2 text-right font-medium">當日持倉市值</th>
                </tr>
              </thead>
              <tbody>
                {audit.events.map((event) => (
                  <tr
                    key={`${event.date}-${event.amount}`}
                    className="border-t border-dashboard-border/70"
                  >
                    <td className="py-2 font-mono text-dashboard-muted">
                      {event.date}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${event.amount >= 0 ? "text-dashboard-pos" : "text-dashboard-neg"}`}
                    >
                      {event.amount >= 0 ? "+" : "−"}
                      {formatTWD(Math.abs(event.amount))}
                    </td>
                    <td className="py-2 text-right font-mono text-dashboard-muted">
                      {formatTWD(event.marketValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function comparisonStatusLabel(
  status: PerformanceBenchmark["comparisonStatus"],
): string {
  switch (status) {
    case "comparable":
      return "可在主要基期比較";
    case "source-unavailable":
      return "來源不可用";
    case "not-comparable-at-primary-base":
      return "來源可用，但無法在主要基期比較";
  }
}

function freshnessLabel(freshness: PerformanceBenchmark["freshness"]): string {
  switch (freshness) {
    case "fresh":
      return "最新";
    case "stale":
      return "資料過期";
    case "unavailable":
      return "來源不可用";
  }
}

function basisLabel(basis: PerformanceBenchmark["basis"]): string {
  return basis === "adjusted-close-total-return-proxy"
    ? "調整後收盤價（總報酬代理）"
    : "價格指數";
}

function BenchmarkProvenance({
  benchmark,
  role,
}: {
  benchmark: PerformanceBenchmark;
  role: string;
}) {
  const fields = [
    ["代號 / 計算基礎", `${benchmark.symbol} / ${basisLabel(benchmark.basis)}`],
    ["資料新鮮度", freshnessLabel(benchmark.freshness)],
    ["最新資料日", benchmark.latestDate ?? "—"],
    ["預期最新日", benchmark.expectedLatestDate ?? "—"],
    [
      "來源 / 版本",
      benchmark.source
        ? `${benchmark.source}${benchmark.sourceVersion ? ` / ${benchmark.sourceVersion}` : ""}`
        : "—",
    ],
    ["擷取時間", benchmark.fetchedAt ?? "—"],
    ["比較狀態", comparisonStatusLabel(benchmark.comparisonStatus)],
  ];

  return (
    <section
      className="rounded-ds-md border border-dashboard-border bg-dashboard-chip/30 p-4"
      aria-label={`${benchmark.name} 資料來源`}
    >
      <h3 className="text-[13px] font-semibold">
        {benchmark.name}（{role}）
      </h3>
      <dl className="mt-3 space-y-2 text-[11px]">
        {fields.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="shrink-0 text-dashboard-faint">{label}</dt>
            <dd className="break-all text-right font-mono text-dashboard-muted">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {benchmark.warnings.length > 0 ? (
        <div className="mt-3 border-t border-dashboard-border pt-2">
          <p className="text-[11px] font-medium text-dashboard-faint">
            資料警示
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-dashboard-faint">
            {benchmark.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 border-t border-dashboard-border pt-2 text-[11px] text-dashboard-faint">
          資料警示：無
        </p>
      )}
    </section>
  );
}

function AuditMetric({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: number;
  positive?: boolean;
}) {
  return (
    <div className="rounded-ds-sm bg-dashboard-chip/50 px-3 py-2">
      <div className="text-[11px] text-dashboard-faint">{label}</div>
      <div
        className={`mt-1 font-mono text-[14px] font-medium ${positive ? "text-dashboard-pos" : value < 0 ? "text-dashboard-neg" : "text-dashboard-muted"}`}
      >
        {value > 0 ? "+" : value < 0 ? "−" : ""}
        {formatTWD(Math.abs(value))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range selector (inline)
// ---------------------------------------------------------------------------

function RangeSelector({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-[2px] rounded-[10px] border border-dashboard-border bg-dashboard-surface p-[3px]"
      role="radiogroup"
      aria-label="時間範圍"
    >
      {RANGES.map((r) => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(r.key)}
            className={`rounded-[8px] border-none px-[12px] py-[5px] font-mono text-[12px] leading-none transition-colors ${
              active
                ? "bg-dashboard-surface-2 text-dashboard-text font-semibold"
                : "bg-transparent text-dashboard-faint font-normal hover:text-dashboard-text"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
