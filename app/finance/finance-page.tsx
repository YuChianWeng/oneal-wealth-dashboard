"use client";

import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/ui/chip";
import { stubNavSections } from "@/lib/nav-sections";
import { formatTWD, formatPercent } from "@/lib/format";
import { useMonthlySummary } from "@/lib/hooks/use-finance";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Colour palette for the category pie chart (matches dashboard tokens). */
const CATEGORY_COLORS = [
  "#57b394", // accent
  "#5f84c6", // accent-2
  "#d9a441", // warn
  "#db7f6f", // neg
  "#8b7dba", // purple-ish
  "#5cbf98", // pos
  "#c69c6d", // warm gold
  "#7ba6c7", // steel blue
  "#d48b9b", // rose
  "#8c9e7c", // olive
];

/** Get the current month in YYYY-MM format (Asia/Taipei). */
function getCurrentMonth(): string {
  const now = new Date();
  const tw = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tw.getFullYear();
  const m = String(tw.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Format YYYY-MM to a Chinese month label. */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y} 年 ${parseInt(m, 10)} 月`;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function FinanceSkeleton() {
  return (
    <div className="flex flex-col gap-[22px]">
      {/* Metric cards row */}
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={110} />
        ))}
      </div>
      {/* Chart + breakdown row */}
      <div className="grid grid-cols-1 gap-[22px] lg:grid-cols-2">
        <Skeleton height={340} />
        <Skeleton height={340} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pie chart helper
// ---------------------------------------------------------------------------

interface ChartDatum {
  name: string;
  value: number;
}

function CategoryPieChart({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="尚無支出分類資料"
        description="本月尚無消費記錄。"
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(_value) => [formatTWD(Number(_value)), ""]}
          contentStyle={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
            color: "var(--color-text)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "11.5px", color: "var(--color-muted)" }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FinancePage() {
  const currentMonth = getCurrentMonth();
  const [month] = useState(currentMonth);

  const { data, error, isLoading, isValidating, mutate } =
    useMonthlySummary(month);

  // ── Compute derived values ──────────────────────────────────────────
  const savingsRate = useMemo(() => {
    if (!data) return null;
    if (data.totalIncome <= 0) return 0;
    return ((data.netCashflow / data.totalIncome) * 100);
  }, [data]);

  const chartData: ChartDatum[] = useMemo(() => {
    if (!data) return [];
    return data.categoryBreakdown.map((c) => ({
      name: c.category,
      value: c.amount,
    }));
  }, [data]);

  // ── Loading state ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{
          title: "收支分析",
          subtitle: "載入中…",
          monthBadge: formatMonthLabel(month),
        }}
      >
        <FinanceSkeleton />
      </AppShell>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  if (error) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{
          title: "收支分析",
          subtitle: "資料載入失敗",
          monthBadge: formatMonthLabel(month),
        }}
      >
        <ErrorState
          message="無法載入收支資料，請檢查資料來源或稍後再試。"
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────
  if (!data || (data.totalIncome === 0 && data.totalExpense === 0)) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{
          title: "收支分析",
          subtitle: formatMonthLabel(month),
          monthBadge: formatMonthLabel(month),
        }}
      >
        <EmptyState
          title="本月尚無收支資料"
          description={`${formatMonthLabel(month)} 尚無任何交易記錄。`}
        />
      </AppShell>
    );
  }

  // ── Data loaded ─────────────────────────────────────────────────────
  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: "收支分析",
        subtitle: isValidating ? "更新中…" : "收入與支出趨勢、分類分析",
        monthBadge: formatMonthLabel(month),
      }}
    >
      <div className="flex flex-col gap-[22px]">
        {/* ── KPI cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="總收入"
            value={formatTWD(data.totalIncome)}
            trend="up"
          />
          <MetricCard
            label="總支出"
            value={formatTWD(data.totalExpense)}
            trend="down"
          />
          <MetricCard
            label="收支淨額"
            value={formatTWD(data.netCashflow)}
            trend={data.netCashflow >= 0 ? "up" : "down"}
          />
          <MetricCard
            label="儲蓄率"
            value={
              savingsRate !== null
                ? formatPercent(savingsRate, true)
                : "—%"
            }
            trend={savingsRate !== null && savingsRate > 0 ? "up" : "down"}
            description="（收入 − 支出）÷ 收入"
          />
        </div>

        {/* ── Category pie chart ────────────────────────────────── */}
        <Card
          header={
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">支出分類佔比</span>
              <Chip variant="default">
                {data.categoryBreakdown.length} 個分類
              </Chip>
            </div>
          }
        >
          <CategoryPieChart data={chartData} />
        </Card>

        {/* ── Account breakdown ─────────────────────────────────── */}
        {data.accountBreakdown.length > 0 && (
          <Card
            header={
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold">
                  帳戶支出明細
                </span>
                <Chip variant="default">
                  {data.accountBreakdown.length} 個帳戶
                </Chip>
              </div>
            }
          >
            <div className="flex flex-col gap-[10px]">
              {data.accountBreakdown.map((acct) => (
                <div
                  key={acct.account}
                  className="flex items-center justify-between rounded-ds-sm px-[12px] py-[10px] transition-colors hover:bg-dashboard-chip"
                >
                  <span className="text-[13px] text-dashboard-muted">
                    {acct.account}
                  </span>
                  <span className="font-mono-dashboard text-[14px] font-medium text-dashboard-text">
                    {formatTWD(acct.amount)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Refresh hint ──────────────────────────────────────── */}
        {isValidating && (
          <div className="text-center text-[11px] text-dashboard-faint">
            正在更新資料…
          </div>
        )}
      </div>
    </AppShell>
  );
}
