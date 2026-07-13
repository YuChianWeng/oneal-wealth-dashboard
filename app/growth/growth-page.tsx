"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  LineChart as RechartsLine,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { MetricCard, type MetricTrend } from "@/components/ui/metric-card";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Chip } from "@/components/ui/chip";
import { formatTWD, formatPercent, formatDate } from "@/lib/format";
import type { GrowthResponse } from "@/app/api/growth/route";

// ---------------------------------------------------------------------------
// Chart tooltip
// ---------------------------------------------------------------------------

function GrowthTooltip({
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
          淨資產 {formatTWD(entry.value)}
        </p>
      ))}
    </div>
  );
}

function LoanInvestmentTooltip({
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
          {entry.name} {formatPercent(entry.value, true)}
        </p>
      ))}
    </div>
  );
}

export function signedTwd(value: number): string {
  if (value > 0) return `+${formatTWD(value)}`;
  if (value < 0) return `−${formatTWD(Math.abs(value))}`;
  return formatTWD(0);
}

function cashQualityLabel(
  quality: NonNullable<GrowthResponse["loanInvestment"]>["points"][number]["cashAsOfQuality"],
): string {
  if (quality === "confirmed-explicit-event") return "明確確認";
  if (quality === "inferred-from-balance-entry") return "舊資料推定";
  return "無法確認";
}

export function LoanInvestmentPerformanceCard({
  performance,
}: {
  performance: NonNullable<GrowthResponse["loanInvestment"]>;
}) {
  const points = performance.points;
  const latest = points[points.length - 1];
  const benchmarkReturn = latest?.taiexReturnPct ?? null;
  const excessReturn =
    benchmarkReturn === null
      ? null
      : latest.strategyReturnPct - benchmarkReturn;
  const chartData = points.map((point) => ({
    ...point,
    label: formatShortDate(point.date),
    strategy: point.strategyReturnPct,
    taiex: point.taiexReturnPct,
  }));

  return (
    <Card
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">
              保單借款投資績效 vs 大盤
            </h2>
            <p className="mt-0.5 text-[11px] text-dashboard-faint">
              {performance.strategyLabel} · 起始本金{" "}
              {formatTWD(performance.initialPrincipal)}
            </p>
          </div>
          <Chip variant="accent">起始 {performance.startDate}</Chip>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <PolicyPerformanceMetric
          label="毛策略資產"
          value={formatTWD(
            performance.economics?.grossStrategyValue ?? latest.strategyValue,
          )}
        />
        <PolicyPerformanceMetric
          label="毛累積報酬"
          value={formatPercent(
            performance.economics?.grossReturnPct ?? latest.strategyReturnPct,
            true,
          )}
          tone={
            (performance.economics?.grossReturnPct ?? latest.strategyReturnPct) >= 0
              ? "positive"
              : "negative"
          }
        />
        <PolicyPerformanceMetric
          label="扣息後策略資產"
          value={
            performance.economics?.netStrategyValue == null
              ? "待確認"
              : formatTWD(performance.economics.netStrategyValue)
          }
        />
        <PolicyPerformanceMetric
          label="扣息後累積報酬"
          value={
            performance.economics?.netReturnPct == null
              ? "待確認"
              : formatPercent(performance.economics.netReturnPct, true)
          }
          tone={
            performance.economics?.netReturnPct == null
              ? "neutral"
              : performance.economics.netReturnPct >= 0
                ? "positive"
                : "negative"
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <PolicyPerformanceMetric
          label="可歸屬融資成本"
          value={
            performance.economics?.financingCost == null
              ? "待確認"
              : formatTWD(performance.economics.financingCost)
          }
        />
        <PolicyPerformanceMetric
          label="保單借款年利率"
          value={
            performance.economics
              ? formatPercent(performance.economics.annualLoanRate * 100)
              : "—"
          }
        />
        <PolicyPerformanceMetric
          label="損益兩平年化報酬"
          value={
            performance.economics?.breakEvenAnnualReturnPct == null
              ? "—"
              : formatPercent(
                  performance.economics.breakEvenAnnualReturnPct,
                )
          }
        />
        <PolicyPerformanceMetric
          label="TAIEX 同期報酬"
          value={
            benchmarkReturn === null
              ? "—"
              : formatPercent(benchmarkReturn, true)
          }
          tone="neutral"
        />
        <PolicyPerformanceMetric
          label="相對大盤（毛）"
          value={
            excessReturn === null ? "—" : formatPercent(excessReturn, true)
          }
          tone={
            excessReturn !== null && excessReturn >= 0 ? "positive" : "negative"
          }
        />
      </div>

      {performance.economics?.status === "needs-review" && (
        <div className="mt-3 rounded-ds-sm border border-dashboard-warn/30 bg-dashboard-warn/10 px-3 py-2 text-[11px] text-dashboard-warn">
          融資成本尚待確認：
          {performance.economics.statusReason?.toLowerCase().includes("payment")
            ? "利息付款尚未完成策略歸屬；目前僅顯示毛績效。"
            : "缺少已確認的起始應計利息 baseline；目前僅顯示毛績效。"}
        </div>
      )}
      {performance.economics?.status === "partial" && (
        <div className="mt-3 rounded-ds-sm border border-dashboard-warn/30 bg-dashboard-warn/10 px-3 py-2 text-[11px] text-dashboard-warn">
          融資成本資料不完整：目前累計利息低於已確認 baseline，淨績效僅供檢查。
        </div>
      )}

      <div className="mt-4 rounded-ds-md border border-dashboard-border bg-dashboard-bg/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13px] font-semibold text-dashboard-text">
              策略資產對帳拆解
            </h3>
            <p className="mt-0.5 text-[10.5px] text-dashboard-faint">
              已確認現金 ＋ 未交割調整 ＝ 有效現金；再加持股市值。
            </p>
          </div>
          <Link
            href="/portfolio/reconciliation"
            className="text-[11px] font-medium text-dashboard-accent hover:underline"
          >
            前往投資對帳中心
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <PolicyPerformanceMetric
            label="已確認現金"
            value={
              latest.confirmedCash === null
                ? "—"
                : formatTWD(latest.confirmedCash)
            }
          />
          <PolicyPerformanceMetric
            label="未交割調整"
            value={signedTwd(latest.pendingTradeCashAdjustment)}
            tone={
              latest.pendingTradeCashAdjustment >= 0 ? "positive" : "negative"
            }
          />
          <PolicyPerformanceMetric
            label="有效現金"
            value={
              latest.effectiveCashValue === null
                ? "—"
                : formatTWD(latest.effectiveCashValue)
            }
          />
          <PolicyPerformanceMetric
            label="持股市值"
            value={
              latest.brokerageMarketValue === null
                ? "—"
                : formatTWD(latest.brokerageMarketValue)
            }
          />
        </div>
        <p className="mt-3 text-[10.5px] text-dashboard-faint">
          {latest.cashAsOfDate
            ? `截至 ${latest.cashAsOfDate} · ${cashQualityLabel(latest.cashAsOfQuality)}`
            : "現金確認日期 unavailable"}
          {latest.pendingTradeCount > 0
            ? ` · ${latest.pendingTradeCount} 筆未交割交易`
            : ""}
        </p>
      </div>

      <div className="mt-4 h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLine
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
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            />
            <Tooltip content={<LoanInvestmentTooltip />} />
            <Line
              type="monotone"
              dataKey="strategy"
              name="借款投資池"
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="taiex"
              name="TAIEX"
              stroke="var(--color-warn)"
              strokeWidth={2}
              strokeDasharray="7 5"
              dot={false}
            />
          </RechartsLine>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-dashboard-faint">
        2026-06-20 以 NT$200,000 建立起始點；正式帳戶觀測從 2026-06-21
        起。策略資產 = 有效現金（已確認現金 + 未交割調整）+ 股票市值；TAIEX
        使用每個觀測日當日或之前最近的可用收盤價。
      </p>
    </Card>
  );
}

function PolicyPerformanceMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive"
      ? "text-dashboard-pos"
      : tone === "negative"
        ? "text-dashboard-neg"
        : "text-dashboard-text";
  return (
    <div className="rounded-ds-sm bg-dashboard-chip/40 p-3">
      <div className="text-[10.5px] text-dashboard-faint">{label}</div>
      <div
        className={`mt-1 font-mono-dashboard text-[16px] font-semibold ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Net worth chart data builder
// ---------------------------------------------------------------------------

interface NetWorthChartPoint {
  date: string;
  label: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

function formatShortDate(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("-");
  if (parts.length >= 3) {
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  }
  return iso;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function GrowthSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={100} />
        ))}
      </div>
      <Skeleton height={350} />
      <Skeleton height={200} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trendFromValue(val: number | null): MetricTrend | undefined {
  if (val === null) return undefined;
  if (val > 0) return "up";
  if (val < 0) return "down";
  return "neutral";
}

function efTrend(months: number | null | undefined): MetricTrend {
  if (months == null) return "neutral";
  if (months >= 6 || !Number.isFinite(months)) return "up";
  return "down";
}

function drTrend(ratio: number | null | undefined): MetricTrend {
  if (ratio == null) return "neutral";
  if (ratio < 30) return "up";
  return "down";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GrowthPage() {
  const { data, error, isLoading, mutate } = useSWR<GrowthResponse>(
    "/api/growth",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "Unknown error");
      return json.data as GrowthResponse;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30_000,
    },
  );

  // ── Derived values ──────────────────────────────────────────────────

  const netWorth = data?.netWorth ?? null;
  const health = data?.financialHealth;
  const milestones = data?.milestones ?? [];
  const coverageLabel = netWorth?.coverageLabel ?? null;

  const chartData: NetWorthChartPoint[] = useMemo(() => {
    if (!netWorth?.points) return [];
    return netWorth.points.map((p) => ({
      date: p.date,
      label: formatShortDate(p.date),
      netWorth: p.netWorth,
      assets: p.totalAssets,
      liabilities: p.totalLiabilities,
    }));
  }, [netWorth]);

  const latestNetWorthVal = useMemo(() => {
    const points = netWorth?.points;
    if (!points?.length) return null;
    return points[points.length - 1].netWorth;
  }, [netWorth]);

  const growthPct = useMemo(() => {
    const points = netWorth?.points;
    if (!points || points.length < 2) return null;
    const first = points[0].netWorth;
    const last = points[points.length - 1].netWorth;
    if (first === 0) return null;
    return ((last - first) / first) * 100;
  }, [netWorth]);

  // Pre-extract health metrics for cleaner narrowing
  const efMonths = health?.emergencyFundMonths ?? null;
  const sRate = health?.savingsRate ?? null;
  const dRatio = health?.debtRatio ?? null;
  const conc = health?.concentration ?? null;

  // ── Empty detection ────────────────────────────────────────────────

  const isEmpty =
    data &&
    !netWorth &&
    milestones.length === 0 &&
    efMonths === null &&
    sRate === null &&
    dRatio === null &&
    conc === null;

  // ── Loading ────────────────────────────────────────────────────────

  if (isLoading && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "淨資產成長" }}>
        <GrowthSkeleton />
      </AppShell>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "淨資產成長" }}>
        <ErrorState
          message={
            error instanceof Error ? error.message : "載入成長資料時發生錯誤"
          }
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────

  if (isEmpty) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "淨資產成長" }}>
        <EmptyState
          title="尚無成長資料"
          description="目前沒有淨資產歷史資料。請確保已設定帳戶餘額快照。"
        />
      </AppShell>
    );
  }

  // ── Has data ───────────────────────────────────────────────────────

  return (
    <AppShell navSections={stubNavSections} topbar={{ title: "淨資產成長" }}>
      {/* ── KPI cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="最新淨資產"
          value={
            latestNetWorthVal !== null ? formatTWD(latestNetWorthVal) : "—"
          }
          trend={trendFromValue(growthPct)}
          trendLabel={
            growthPct !== null ? formatPercent(growthPct, true) : undefined
          }
          deltaLabel={growthPct !== null ? "期間變動率" : undefined}
        />
        <MetricCard
          label="緊急預備金"
          hint="月數"
          value={
            efMonths !== null
              ? `${efMonths === Infinity || efMonths >= 999 ? "∞" : efMonths.toFixed(1)} 月`
              : "—"
          }
          trend={efTrend(efMonths)}
        />
        <MetricCard
          label="儲蓄率"
          value={sRate !== null ? formatPercent(sRate) : "—"}
          trend={trendFromValue(sRate)}
        />
        <MetricCard
          label="負債比率"
          value={dRatio !== null ? formatPercent(dRatio) : "—"}
          trend={drTrend(dRatio)}
        />
      </div>

      {/* ── Net worth trend chart ──────────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              淨資產趨勢
              {coverageLabel && (
                <Chip variant="warn" className="ml-2">
                  部分覆蓋
                </Chip>
              )}
            </h2>
            {coverageLabel && (
              <span className="text-[11px] text-dashboard-faint">
                {coverageLabel}
              </span>
            )}
          </div>
        }
      >
        {chartData.length === 0 ? (
          <div className="py-[30px] text-center text-[12px] text-dashboard-faint">
            尚無淨資產歷史資料
          </div>
        ) : (
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLine
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
                <Tooltip content={<GrowthTooltip />} />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  name="netWorth"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </RechartsLine>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {data?.loanInvestment && (
        <LoanInvestmentPerformanceCard performance={data.loanInvestment} />
      )}

      {/* ── Financial health grid + milestones ──────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Financial health metrics grid */}
        <Card
          header={<h2 className="text-[15px] font-semibold">財務健康指標</h2>}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-ds-sm border border-dashboard-border bg-dashboard-bg p-3">
              <div className="text-[11px] text-dashboard-faint">緊急預備金</div>
              <div className="mt-1 font-mono text-[18px] font-semibold">
                {efMonths !== null
                  ? efMonths === Infinity || efMonths >= 999
                    ? "∞ 個月"
                    : `${efMonths.toFixed(1)} 個月`
                  : "—"}
              </div>
              <div className="mt-1 text-[10px] text-dashboard-faint">
                建議 ≥ 6 個月
              </div>
            </div>

            <div className="rounded-ds-sm border border-dashboard-border bg-dashboard-bg p-3">
              <div className="text-[11px] text-dashboard-faint">儲蓄率</div>
              <div className="mt-1 font-mono text-[18px] font-semibold">
                {sRate !== null ? formatPercent(sRate) : "—"}
              </div>
              <div className="mt-1 text-[10px] text-dashboard-faint">
                建議 ≥ 20%
              </div>
            </div>

            <div className="rounded-ds-sm border border-dashboard-border bg-dashboard-bg p-3">
              <div className="text-[11px] text-dashboard-faint">負債比率</div>
              <div className="mt-1 font-mono text-[18px] font-semibold">
                {dRatio !== null ? formatPercent(dRatio) : "—"}
              </div>
              <div className="mt-1 text-[10px] text-dashboard-faint">
                建議 &lt; 30%
              </div>
            </div>

            <div className="rounded-ds-sm border border-dashboard-border bg-dashboard-bg p-3">
              <div className="text-[11px] text-dashboard-faint">最大集中度</div>
              <div className="mt-1 font-mono text-[18px] font-semibold">
                {conc ? `${conc.maxWeight}%` : "—"}
              </div>
              <div className="mt-1 text-[10px] text-dashboard-faint">
                {conc ? `${conc.maxName} (${conc.maxStock})` : "無持倉"}
              </div>
            </div>
          </div>
        </Card>

        {/* Milestones timeline */}
        <Card header={<h2 className="text-[15px] font-semibold">里程碑</h2>}>
          {!milestones.length ? (
            <div className="py-[30px] text-center text-[12px] text-dashboard-faint">
              尚無里程碑資料
            </div>
          ) : (
            <div className="flex flex-col">
              {milestones.map((m, i) => (
                <div
                  key={`${m.date}-${m.label}`}
                  className={`flex items-start gap-3 py-3 ${
                    i > 0 ? "border-t border-dashboard-border" : ""
                  }`}
                >
                  {/* Timeline dot */}
                  <div className="mt-[5px] flex h-[10px] w-[10px] flex-shrink-0 items-center justify-center rounded-full bg-dashboard-accent">
                    <div className="h-[4px] w-[4px] rounded-full bg-white" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{m.label}</span>
                      <Chip variant="accent">{formatTWD(m.value)}</Chip>
                    </div>
                    <div className="mt-1 text-[11px] text-dashboard-faint">
                      {formatDate(m.date, "short")} · {m.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
