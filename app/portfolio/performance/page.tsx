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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceResponse {
  dates: string[];
  portfolioIndex: number[];
  benchmarkIndex: number[];
  rawMarketValue: number[];
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

function computeWinRate(portfolio: number[], benchmark: number[]): number {
  if (portfolio.length < 2) return 0;
  let wins = 0;
  let total = 0;
  for (let i = 1; i < portfolio.length; i++) {
    const pRet = (portfolio[i] - portfolio[i - 1]) / (portfolio[i - 1] || 1);
    const bRet =
      benchmark.length > i && benchmark[i - 1] > 0
        ? (benchmark[i] - benchmark[i - 1]) / (benchmark[i - 1] || 1)
        : 0;
    total++;
    if (pRet > bRet) wins++;
  }
  return total > 0 ? (wins / total) * 100 : 0;
}

// ---------------------------------------------------------------------------
// Chart data builder
// ---------------------------------------------------------------------------

interface ChartPoint {
  date: string;
  label: string;
  portfolio: number;
  benchmark: number | null;
  marketValue: number;
}

function buildChartData(data: PerformanceResponse): ChartPoint[] {
  return data.dates.map((d, i) => ({
    date: d,
    label: formatDateLabel(d),
    portfolio: data.portfolioIndex[i] ?? 0,
    benchmark: data.benchmarkIndex[i] ?? null,
    marketValue: data.rawMarketValue[i] ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-ds-md border border-dashboard-border bg-dashboard-surface px-3 py-2 shadow-ds-card">
      <p className="mb-1 text-[11px] text-dashboard-faint">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="text-[12px] font-medium"
          style={{ color: entry.color }}
        >
          {entry.name === "marketValue"
            ? `市值 ${formatTWD(entry.value)}`
            : entry.name === "benchmark"
              ? `TAIEX ${entry.value.toFixed(1)}`
              : `組合 ${entry.value.toFixed(1)}`}
        </p>
      ))}
    </div>
  );
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
  const benchmarkReturn =
    data.benchmarkIndex.length > 0 ? computeReturn(data.benchmarkIndex) : null;
  const maxDrawdown = computeMaxDrawdown(data.portfolioIndex);
  const winRate = computeWinRate(data.portfolioIndex, data.benchmarkIndex);

  const hasBenchmark = data.benchmarkIndex.length > 0;
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
          label="組合報酬"
          value={formatPercent(portfolioReturn, true)}
          trend={portfolioReturn >= 0 ? "up" : "down"}
        />
        <MetricCard
          label={hasBenchmark ? "TAIEX 報酬" : "基準報酬"}
          value={
            benchmarkReturn != null
              ? formatPercent(benchmarkReturn, true)
              : "—%"
          }
          trend={
            benchmarkReturn != null
              ? benchmarkReturn >= 0
                ? "up"
                : "down"
              : "neutral"
          }
        />
        <MetricCard
          label="最大回撤"
          value={formatPercent(maxDrawdown, true)}
          trend="down"
        />
        <MetricCard
          label="贏率 vs TAIEX"
          value={`${winRate.toFixed(0)}%`}
          trend={winRate >= 50 ? "up" : "down"}
        />
      </div>

      {/* ── Portfolio vs Benchmark line chart ────────────────────── */}
      <Card
        header={
          <h2 className="text-[15px] font-semibold">組合 vs TAIEX 指數</h2>
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
              <Tooltip content={<ChartTooltip />} />
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
              {hasBenchmark && (
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name="benchmark"
                  stroke="var(--color-muted)"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
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
              <Tooltip content={<ChartTooltip />} />
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
        {!hasBenchmark && (
          <p className="mt-3 text-[12px] text-dashboard-faint">
            TAIEX 基準指數資料尚不可用 — 僅顯示組合自身績效。
          </p>
        )}
      </Card>
    </AppShell>
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
