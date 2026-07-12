"use client";

import { useMemo, useEffect, useState } from "react";
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
import { useMonthlySummary, useTransactions } from "@/lib/hooks/use-finance";

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
      <EmptyState title="尚無支出分類資料" description="本月尚無消費記錄。" />
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

export function FinancePage({ initialMonth }: { initialMonth: string }) {
  const month = initialMonth;
  const [transactionPage, setTransactionPage] = useState(1);
  const { data, error, isLoading, isValidating, mutate } =
    useMonthlySummary(month);
  const {
    data: transactionData,
    error: transactionError,
    isLoading: isTransactionsLoading,
  } = useTransactions(month, transactionPage, 50);

  useEffect(() => setTransactionPage(1), [month]);

  // ── Compute derived values ──────────────────────────────────────────
  const savingsRate = useMemo(() => {
    if (!data) return null;
    if (data.totalIncome <= 0) return 0;
    return (data.netCashflow / data.totalIncome) * 100;
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
              savingsRate !== null ? formatPercent(savingsRate, true) : "—%"
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

        {/* ── Per-transaction ledger ─────────────────────────────── */}
        <Card
          header={
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">本月收支明細</span>
              <Chip variant="default">
                {transactionData ? `${transactionData.total} 筆` : "載入中"}
              </Chip>
            </div>
          }
        >
          {isTransactionsLoading ? (
            <div className="py-8 text-center text-[12px] text-dashboard-faint">
              載入交易明細…
            </div>
          ) : transactionError ? (
            <div className="py-8 text-center text-[12px] text-dashboard-neg">
              無法載入交易明細，請稍後重試。
            </div>
          ) : !transactionData?.rows.length ? (
            <div className="py-8 text-center text-[12px] text-dashboard-faint">
              本月沒有可顯示的收支交易。
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-[12px]">
                  <thead className="border-b border-dashboard-border text-dashboard-faint">
                    <tr>
                      <th className="px-2 py-2 font-medium">日期</th>
                      <th className="px-2 py-2 font-medium">項目</th>
                      <th className="px-2 py-2 font-medium">分類</th>
                      <th className="px-2 py-2 font-medium">帳戶</th>
                      <th className="px-2 py-2 text-right font-medium">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionData.rows.map((transaction) => {
                      const isIncome = transaction.type === "income";
                      const typeLabel = isIncome
                        ? "收入"
                        : transaction.type === "expense"
                          ? "支出"
                          : transaction.type === "investment_settlement"
                            ? "投資結算"
                            : transaction.type === "loan_interest_payment"
                              ? "貸款利息"
                              : "貸款本金";
                      return (
                        <tr
                          key={transaction.id}
                          className="border-b border-dashboard-border/70 last:border-0 hover:bg-dashboard-chip/50"
                        >
                          <td className="whitespace-nowrap px-2 py-3 font-mono text-dashboard-faint">
                            {transaction.date.slice(0, 10)}
                          </td>
                          <td className="max-w-[260px] px-2 py-3 text-dashboard-text">
                            <div className="truncate">{transaction.item}</div>
                            {transaction.note && (
                              <div className="mt-0.5 truncate text-[11px] text-dashboard-faint">
                                {transaction.note}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <Chip variant={isIncome ? "pos" : "default"}>
                              {typeLabel} · {transaction.category}
                            </Chip>
                          </td>
                          <td className="px-2 py-3 text-dashboard-muted">
                            {transaction.account}
                          </td>
                          <td
                            className={`whitespace-nowrap px-2 py-3 text-right font-mono font-medium ${isIncome ? "text-dashboard-pos" : "text-dashboard-neg"}`}
                          >
                            {isIncome ? "+" : "−"}
                            {formatTWD(transaction.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {transactionData.total > transactionData.pageSize && (
                <div className="mt-4 flex items-center justify-between border-t border-dashboard-border pt-3 text-[12px] text-dashboard-muted">
                  <span>
                    第 {transactionData.page} /{" "}
                    {Math.ceil(
                      transactionData.total / transactionData.pageSize,
                    )}{" "}
                    頁
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setTransactionPage((page) => Math.max(1, page - 1))
                      }
                      disabled={transactionData.page <= 1}
                      className="rounded-ds-sm border border-dashboard-border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一頁
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransactionPage((page) => page + 1)}
                      disabled={
                        transactionData.page * transactionData.pageSize >=
                        transactionData.total
                      }
                      className="rounded-ds-sm border border-dashboard-border px-3 py-1 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一頁
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

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
