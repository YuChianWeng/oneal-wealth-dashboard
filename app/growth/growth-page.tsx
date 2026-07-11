"use client";

import { useMemo } from "react";
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
