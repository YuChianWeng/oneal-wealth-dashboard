"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/layout/app-shell";
import type { NavSection } from "@/components/layout/sidebar";
import type { RangeKey } from "@/components/range/range-selector";
import { MetricCard, type MetricTrend } from "@/components/ui/metric-card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { NetWorthLineChart } from "@/components/overview/net-worth-line-chart";
import { DonutChart } from "@/components/overview/donut-chart";
import { OverviewSkeleton } from "@/components/overview/overview-skeleton";
import { formatTWD, formatPercent, formatCompact } from "@/lib/format";
import type {
  OverviewResponse,
  InsightSeverity,
  NetWorthSeries,
} from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Navigation structure
// ---------------------------------------------------------------------------

const NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [{ label: "首頁總覽", href: "/", icon: null }],
  },
  {
    label: "財務 Finance",
    items: [
      { label: "收支分析", href: "/finance", icon: null, activePrefix: true },
      { label: "帳戶與負債", href: "/finance/accounts", icon: null },
      { label: "月度回顧", href: "/finance/reviews", icon: null },
    ],
  },
  {
    label: "投資 Portfolio",
    items: [
      { label: "持倉總覽", href: "/portfolio", icon: null, activePrefix: true },
      {
        label: "個股研究",
        href: "/portfolio/symbol",
        icon: null,
        activePrefix: true,
      },
      { label: "交易紀錄", href: "/portfolio/transactions", icon: null },
      { label: "績效比較", href: "/portfolio/performance", icon: null },
    ],
  },
  {
    label: "成長 · 其他",
    items: [
      { label: "淨資產成長", href: "/growth", icon: null, activePrefix: true },
      { label: "財務健康", href: "/insights", icon: null },
      { label: "Insights", href: "/insights", icon: null },
    ],
  },
];

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

interface GrowthData {
  netWorth: NetWorthSeries | null;
}

async function fetchGrowth(): Promise<GrowthData> {
  const res = await fetch("/api/growth");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "Unknown error");
  return json.data as GrowthData;
}

async function fetchOverview(range: RangeKey): Promise<OverviewResponse> {
  const res = await fetch(`/api/overview?range=${range}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "Unknown error");
  return json.data as OverviewResponse;
}

function filterNetWorthByRange(
  points: NonNullable<NetWorthSeries>["points"],
  range: RangeKey,
) {
  if (range === "All" || points.length === 0) return points;
  const end = new Date(`${points[points.length - 1].date}T00:00:00Z`);
  const start = new Date(end);
  const months =
    range === "1M" ? 1 : range === "3M" ? 3 : range === "1Y" ? 12 : 120;
  if (range === "YTD") start.setUTCMonth(0, 1);
  else start.setUTCMonth(start.getUTCMonth() - months);
  const since = start.toISOString().slice(0, 10);
  return points.filter((point) => point.date >= since);
}

// ---------------------------------------------------------------------------
// Range note mapping
// ---------------------------------------------------------------------------

const RANGE_NOTES: Record<RangeKey, string> = {
  "1M": "近 30 天",
  "3M": "近 3 個月",
  YTD: "年初至今",
  "1Y": "近 12 個月",
  All: "全部期間",
};

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_META: Record<
  InsightSeverity,
  { color: string; glow: string; label: string; chipClass: string }
> = {
  "action-needed": {
    color: "var(--color-neg)",
    glow: "color-mix(in srgb, var(--color-neg) 20%, transparent)",
    label: "待處理",
    chipClass:
      "text-dashboard-neg bg-[color-mix(in_srgb,var(--color-neg)_13%,transparent)]",
  },
  notice: {
    color: "var(--color-warn)",
    glow: "color-mix(in srgb, var(--color-warn) 22%, transparent)",
    label: "注意",
    chipClass:
      "text-dashboard-warn bg-[color-mix(in_srgb,var(--color-warn)_14%,transparent)]",
  },
  info: {
    color: "var(--color-muted)",
    glow: "color-mix(in srgb, var(--color-muted) 16%, transparent)",
    label: "資訊",
    chipClass:
      "text-dashboard-muted bg-[color-mix(in_srgb,var(--color-muted)_10%,transparent)]",
  },
};

// ---------------------------------------------------------------------------
// Trend determination from change value
// ---------------------------------------------------------------------------

function trendFromChange(
  change: number | null,
  positiveIsGood?: boolean,
): {
  trend?: MetricTrend;
  trendLabel?: string;
} {
  if (change === null) return {};
  const up = (positiveIsGood ?? true) ? "up" : "down";
  const down = (positiveIsGood ?? true) ? "down" : "up";
  return {
    trend:
      change > 0
        ? (up as MetricTrend)
        : change < 0
          ? (down as MetricTrend)
          : "neutral",
    trendLabel: formatPercent(Math.abs(change), true),
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const [range, setRange] = useState<RangeKey>("3M");

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `overview-${range}`,
    () => fetchOverview(range),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30_000,
    },
  );

  const { data: growth } = useSWR("overview-net-worth", fetchGrowth, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
  });

  const netWorthPoints = useMemo(
    () => filterNetWorthByRange(growth?.netWorth?.points ?? [], range),
    [growth, range],
  );

  // ── Derived data ──────────────────────────────────────────────────

  const totalPortfolioValue = useMemo(() => {
    if (!data?.allocation?.byStock) return null;
    return data.allocation.byStock.reduce((sum, s) => sum + s.value, 0);
  }, [data]);

  const totalAllocationValue = useMemo(() => {
    if (!data?.allocation?.byStock) return null;
    return data.allocation.byStock.reduce((sum, s) => sum + s.value, 0);
  }, [data]);

  const latestCashFlow = useMemo(() => {
    if (!data?.monthlyCashFlow?.length) return null;
    return data.monthlyCashFlow[data.monthlyCashFlow.length - 1];
  }, [data]);

  // Severity counts for insight summary badges
  const severityCounts = useMemo(() => {
    const counts: Record<InsightSeverity, number> = {
      "action-needed": 0,
      notice: 0,
      info: 0,
    };
    if (data?.insights) {
      for (const ins of data.insights) {
        counts[ins.severity] = (counts[ins.severity] ?? 0) + 1;
      }
    }
    return counts;
  }, [data]);

  // ── Topbar subtitle ───────────────────────────────────────────────

  const topbarSubtitle = useMemo(() => {
    const sourceCount = data ? 3 : 0;
    const loadingTag = isValidating ? " · 更新中" : "";
    return data
      ? `資料已載入 · ${sourceCount} 個資料來源${loadingTag}`
      : "資料載入中…";
  }, [data, isValidating]);

  const monthBadge = "當月";

  // ── Render ────────────────────────────────────────────────────────

  return (
    <AppShell
      navSections={NAV_SECTIONS}
      topbar={{
        title: "總覽",
        subtitle: topbarSubtitle,
        monthBadge,
        range,
        onRangeChange: setRange,
      }}
      financeLastSync={undefined}
      priceLastSync={undefined}
      warningCount={severityCounts["action-needed"] + severityCounts["notice"]}
    >
      {/* Loading state */}
      {isLoading && !data && <OverviewSkeleton />}

      {/* Error state */}
      {error && !data && (
        <ErrorState
          message={`載入總覽資料時發生錯誤：${error instanceof Error ? error.message : "未知錯誤"}`}
          onRetry={() => mutate()}
          retryLabel="重新載入"
        />
      )}

      {/* Empty state (data loaded but entirely empty) */}
      {data &&
        !data.kpiCards?.length &&
        !data.allocation?.byStock?.length &&
        !data.performanceChart?.dates?.length &&
        !data.insights?.length && (
          <EmptyState
            title="尚無總覽資料"
            description="目前沒有任何財務或投資資料。請先匯入交易記錄與帳戶資料。"
          />
        )}

      {/* Main dashboard content */}
      {data && (data.kpiCards?.length || data.allocation?.byStock?.length) && (
        <div className="flex flex-col gap-[22px]">
          {/* ── KPI Cards ─────────────────────────────────────────── */}
          <section className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
            {data.kpiCards.map((card, i) => {
              const { trend, trendLabel } = trendFromChange(
                card.change,
                card.positiveIsGood,
              );
              const prefix = card.prefix ?? "";
              const suffix = card.suffix ?? "";
              const formattedValue =
                suffix === "%"
                  ? formatPercent(card.value)
                  : prefix === "NT$"
                    ? formatTWD(card.value)
                    : `${prefix}${card.value}${suffix}`;

              return (
                <MetricCard
                  key={i}
                  label={card.label}
                  value={formattedValue}
                  trend={trend}
                  trendLabel={trendLabel}
                />
              );
            })}

            {/* Additional computed KPI: Monthly expense */}
            {latestCashFlow && (
              <MetricCard
                label="本月生活支出"
                hint="排除投資"
                value={formatTWD(latestCashFlow.expense)}
                trend="neutral"
              />
            )}

            {/* Additional computed KPI: Net Cash Flow summary */}
            {latestCashFlow && (
              <MetricCard
                label="本月結餘"
                hint="收入 − 支出"
                value={formatTWD(latestCashFlow.netCashflow)}
                trend={latestCashFlow.netCashflow >= 0 ? "up" : "down"}
              />
            )}
          </section>

          {/* ── Net Worth Chart + Allocation Donut ────────────────── */}
          <section className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.72fr_1fr]">
            {/* Net worth growth chart */}
            <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px_16px] shadow-ds-card">
              <div className="mb-[10px] flex flex-wrap items-start justify-between gap-[14px]">
                <div>
                  <h2 className="m-0 text-[15px] font-semibold">淨資產成長</h2>
                </div>
              </div>
              <NetWorthLineChart
                points={netWorthPoints.map((point) => ({
                  date: point.date,
                  netWorth: point.netWorth,
                }))}
                rangeNote={RANGE_NOTES[range]}
              />
            </div>

            {/* Asset allocation donut */}
            <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
              <div className="mb-[6px] flex items-start justify-between">
                <div>
                  <h2 className="m-0 text-[15px] font-semibold">資產配置</h2>
                  <div className="mt-[3px] text-[12px] text-dashboard-faint">
                    總資產{" "}
                    {totalAllocationValue !== null
                      ? formatCompact(totalAllocationValue)
                      : "NT$—"}
                  </div>
                </div>
                <span className="font-mono text-[10.5px] text-dashboard-faint rounded-[20px] border border-dashboard-border px-[8px] py-[3px]">
                  依個股
                </span>
              </div>
              <DonutChart
                buckets={data.allocation?.byStock ?? []}
                totalLabel={
                  totalAllocationValue !== null
                    ? formatCompact(totalAllocationValue)
                    : "NT$—"
                }
              />

              {/* Allocation summary stats */}
              {data.allocation?.byStock?.length > 0 && (
                <div className="mt-[16px] grid grid-cols-2 gap-[14px_10px] border-t border-dashboard-border pt-[15px]">
                  <div>
                    <div className="text-[11px] text-dashboard-faint">
                      持倉數量
                    </div>
                    <div className="mt-[2px] font-mono text-[17px] font-semibold">
                      {data.allocation.byStock.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-dashboard-faint">
                      最大持股
                    </div>
                    <div className="mt-[2px] font-mono text-[17px] font-semibold text-dashboard-warn">
                      {(() => {
                        const sorted = [...data.allocation.byStock].sort(
                          (a, b) => b.value - a.value,
                        );
                        if (sorted.length === 0) return "—";
                        return `${sorted[0].percentage.toFixed(0)}%`;
                      })()}
                    </div>
                  </div>
                  {totalPortfolioValue !== null &&
                    totalAllocationValue !== null &&
                    totalAllocationValue > 0 && (
                      <div>
                        <div className="text-[11px] text-dashboard-faint">
                          投資占比
                        </div>
                        <div className="mt-[2px] font-mono text-[17px] font-semibold">
                          {(
                            (totalPortfolioValue / totalAllocationValue) *
                            100
                          ).toFixed(1)}
                          %
                        </div>
                      </div>
                    )}
                  {latestCashFlow && (
                    <div>
                      <div className="text-[11px] text-dashboard-faint">
                        本月收入
                      </div>
                      <div className="mt-[2px] font-mono text-[17px] font-semibold text-dashboard-pos">
                        {formatCompact(latestCashFlow.income)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── Insights + Monthly Cash Flow ──────────────────────── */}
          <section className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.72fr_1fr]">
            {/* Insights list */}
            <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
              <div className="mb-[6px] flex items-center justify-between">
                <div className="flex items-center gap-[10px]">
                  <h2 className="m-0 text-[15px] font-semibold">Insights</h2>
                  <span className="font-mono text-[11px] text-dashboard-faint">
                    把資料變成該注意的事
                  </span>
                </div>
                <div className="flex gap-[6px]">
                  {severityCounts["action-needed"] > 0 && (
                    <span
                      className={`rounded-[20px] px-[8px] py-[2px] text-[11px] ${SEVERITY_META["action-needed"].chipClass}`}
                    >
                      待處理 {severityCounts["action-needed"]}
                    </span>
                  )}
                  {severityCounts.notice > 0 && (
                    <span
                      className={`rounded-[20px] px-[8px] py-[2px] text-[11px] ${SEVERITY_META.notice.chipClass}`}
                    >
                      注意 {severityCounts.notice}
                    </span>
                  )}
                  {severityCounts.info > 0 && (
                    <span
                      className={`rounded-[20px] px-[8px] py-[2px] text-[11px] ${SEVERITY_META.info.chipClass}`}
                    >
                      資訊 {severityCounts.info}
                    </span>
                  )}
                </div>
              </div>

              {!data.insights || data.insights.length === 0 ? (
                <div className="py-[30px] text-center text-[12px] text-dashboard-faint">
                  目前沒有需要注意的事項
                </div>
              ) : (
                <div className="flex flex-col">
                  {data.insights.map((insight, i) => {
                    const meta = SEVERITY_META[insight.severity];
                    return (
                      <div
                        key={insight.id}
                        className={`flex items-center gap-[13px] py-[13px] ${
                          i > 0 ? "border-t border-dashboard-border" : ""
                        }`}
                      >
                        <span
                          className="h-[8px] w-[8px] flex-shrink-0 rounded-full"
                          style={{
                            background: meta.color,
                            boxShadow: `0 0 0 4px ${meta.glow}`,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] leading-[1.4]">
                            {insight.title}
                          </div>
                          <div className="mt-[2px] font-mono text-[11px] text-dashboard-faint">
                            {insight.description}
                          </div>
                        </div>
                        {insight.drillThroughUrl ? (
                          <a
                            href={insight.drillThroughUrl}
                            className="flex h-[30px] flex-shrink-0 items-center whitespace-nowrap rounded-[8px] border border-dashboard-border-2 bg-transparent px-[13px] text-[12px] text-dashboard-muted transition-colors hover:bg-dashboard-chip hover:text-dashboard-text"
                          >
                            查看
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Monthly cash flow summary */}
            <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[15px] font-semibold">本月金流</h2>
                <span className="font-mono text-[10.5px] text-dashboard-faint">
                  當月
                </span>
              </div>

              {!latestCashFlow ? (
                <div className="py-[30px] text-center text-[12px] text-dashboard-faint">
                  尚無本月財務資料
                </div>
              ) : (
                <>
                  <div className="mt-[14px] flex flex-col gap-[2px]">
                    <div className="flex items-center justify-between border-b border-dashboard-border py-[10px]">
                      <span className="text-[13px] text-dashboard-muted">
                        收入
                      </span>
                      <span className="font-mono text-[15px] font-semibold text-dashboard-pos">
                        +{formatTWD(latestCashFlow.income)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-dashboard-border py-[10px]">
                      <span className="text-[13px] text-dashboard-muted">
                        生活支出
                      </span>
                      <span className="font-mono text-[15px] font-semibold text-dashboard-neg">
                        −{formatTWD(latestCashFlow.expense)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-dashboard-border py-[10px]">
                      <span className="text-[13px] text-dashboard-muted">
                        結餘
                      </span>
                      <span className="font-mono text-[15px] font-semibold">
                        {formatTWD(latestCashFlow.netCashflow)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-[10px]">
                      <span className="text-[13px] text-dashboard-muted">
                        投資投入
                      </span>
                      <span className="font-mono text-[15px] font-semibold text-dashboard-accent-2">
                        {formatTWD(
                          latestCashFlow.income -
                            latestCashFlow.expense -
                            latestCashFlow.netCashflow >
                            0
                            ? latestCashFlow.income -
                                latestCashFlow.expense -
                                latestCashFlow.netCashflow
                            : 0,
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Savings rate bar */}
                  {latestCashFlow.income > 0 && (
                    <div className="mt-[6px] border-t border-dashboard-border pt-[15px]">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[12.5px] text-dashboard-muted">
                          儲蓄率
                        </span>
                        <span className="font-mono text-[20px] font-semibold text-dashboard-pos">
                          {Math.round(
                            (latestCashFlow.netCashflow /
                              latestCashFlow.income) *
                              100,
                          )}
                          %
                        </span>
                      </div>
                      <div className="mt-[9px] h-[7px] overflow-hidden rounded-[6px] bg-dashboard-surface-2">
                        <div
                          className="h-full rounded-[6px] bg-dashboard-pos"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (latestCashFlow.netCashflow /
                                  latestCashFlow.income) *
                                  100,
                              ),
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-[8px] font-mono text-[11px] text-dashboard-faint">
                        投資投入獨立計算，不併入生活支出
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ── Data freshness summary ────────────────────────────── */}
          <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
            <div className="mb-[9px] flex items-center gap-[8px]">
              <span
                aria-hidden="true"
                className="inline-block h-[7px] w-[7px] rounded-full bg-dashboard-pos"
                style={{
                  boxShadow:
                    "0 0 0 3px color-mix(in srgb, var(--color-pos) 22%, transparent)",
                }}
              />
              <span className="text-[11px] tracking-[0.3px] text-dashboard-muted">
                資料狀態
              </span>
            </div>
            <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-4">
              <div className="flex flex-col gap-[3px]">
                <span className="text-[11px] text-dashboard-faint">
                  財務帳本
                </span>
                <span className="font-mono text-[12px] text-dashboard-muted">
                  已載入
                </span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[11px] text-dashboard-faint">股價</span>
                <span className="font-mono text-[12px] text-dashboard-muted">
                  已載入
                </span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[11px] text-dashboard-faint">
                  持倉筆數
                </span>
                <span className="font-mono text-[12px] text-dashboard-muted">
                  {data.allocation?.byStock?.length ?? "—"}
                </span>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="text-[11px] text-dashboard-faint">
                  警示事項
                </span>
                <span
                  className={`font-mono text-[12px] ${
                    severityCounts["action-needed"] + severityCounts.notice > 0
                      ? "text-dashboard-warn"
                      : "text-dashboard-muted"
                  }`}
                >
                  {severityCounts["action-needed"] + severityCounts.notice > 0
                    ? `${severityCounts["action-needed"] + severityCounts.notice} 項`
                    : "無"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
