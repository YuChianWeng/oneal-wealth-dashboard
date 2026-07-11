"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Chip } from "@/components/ui/chip";
import { useApi } from "@/lib/hooks/use-api";
import { formatTWD, formatDate } from "@/lib/format";
import Link from "next/link";

import type { TradeRecord } from "@/lib/schemas/portfolio";

interface TransactionsResponse {
  trades: TradeRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  const { data, error, isLoading, mutate } = useApi<TransactionsResponse>(
    "/api/portfolio/transactions",
  );

  const [symbolFilter, setSymbolFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);

  // ── Derived data (always called — guards handle null) ───────────────
  const filtered = useMemo(() => {
    if (!data?.trades) return [];
    let result = data.trades;

    if (symbolFilter.trim()) {
      const q = symbolFilter.trim().toUpperCase();
      result = result.filter(
        (t) =>
          t.symbol.toUpperCase().includes(q) ||
          t.name.toUpperCase().includes(q),
      );
    }
    if (dateFrom) {
      result = result.filter((t) => t.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((t) => t.date <= dateTo);
    }
    return result;
  }, [data, symbolFilter, dateFrom, dateTo]);

  const symbols = useMemo(() => {
    if (!data?.trades) return [];
    const set = new Set(data.trades.map((t) => t.symbol));
    return Array.from(set).sort();
  }, [data]);

  const totalBuy = filtered
    .filter((t) => t.side === "buy")
    .reduce((sum, t) => sum + (t.grossAmount ?? t.shares * t.price), 0);
  const totalSell = filtered
    .filter((t) => t.side === "sell")
    .reduce((sum, t) => sum + (t.grossAmount ?? t.shares * t.price), 0);
  const totalFees = filtered.reduce((sum, t) => sum + (t.feeTax ?? 0), 0);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "交易紀錄" }}>
        <Skeleton height={48} />
        <Skeleton height={500} />
      </AppShell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "交易紀錄" }}>
        <ErrorState
          message={error?.message ?? "無法載入交易紀錄"}
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────
  if (data.trades.length === 0) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "交易紀錄" }}>
        <EmptyState
          title="尚無交易紀錄"
          description="目前沒有任何交易紀錄。"
        />
      </AppShell>
    );
  }

  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(0);
  };

  return (
    <AppShell navSections={stubNavSections} topbar={{ title: "交易紀錄" }}>
      {/* ── Summary strip ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="總買入" value={formatTWD(totalBuy)} />
        <Stat label="總賣出" value={formatTWD(totalSell)} />
        <Stat label="手續費" value={formatTWD(totalFees)} />
        <Stat label="交易筆數" value={`${filtered.length}`} />
      </div>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="股票代號">
            <select
              value={symbolFilter}
              onChange={(e) =>
                handleFilterChange(setSymbolFilter, e.target.value)
              }
              className="rounded-ds-sm border border-dashboard-border bg-dashboard-surface px-3 py-[7px] text-[13px] text-dashboard-text focus:outline-none focus:ring-1 focus:ring-dashboard-accent"
            >
              <option value="">全部</option>
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="起始日期">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) =>
                handleFilterChange(setDateFrom, e.target.value)
              }
              className="rounded-ds-sm border border-dashboard-border bg-dashboard-surface px-3 py-[7px] text-[13px] text-dashboard-text focus:outline-none focus:ring-1 focus:ring-dashboard-accent"
            />
          </FilterField>

          <FilterField label="結束日期">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
              className="rounded-ds-sm border border-dashboard-border bg-dashboard-surface px-3 py-[7px] text-[13px] text-dashboard-text focus:outline-none focus:ring-1 focus:ring-dashboard-accent"
            />
          </FilterField>

          {(symbolFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSymbolFilter("");
                setDateFrom("");
                setDateTo("");
                setPage(0);
              }}
              className="rounded-ds-sm border border-dashboard-border px-3 py-[7px] text-[12px] text-dashboard-faint hover:text-dashboard-text"
            >
              清除篩選
            </button>
          )}
        </div>
      </Card>

      {/* ── Table ────────────────────────────────────────────────── */}
      <Card>
        {paged.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-dashboard-faint">
            沒有符合篩選條件的交易紀錄。
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-dashboard-border text-[11.5px] uppercase tracking-[0.8px] text-dashboard-faint">
                    <th className="px-3 py-[10px] font-medium">日期</th>
                    <th className="px-3 py-[10px] font-medium">股票</th>
                    <th className="px-3 py-[10px] font-medium">方向</th>
                    <th className="px-3 py-[10px] font-medium">股數</th>
                    <th className="px-3 py-[10px] font-medium">價格</th>
                    <th className="px-3 py-[10px] font-medium">總額</th>
                    <th className="px-3 py-[10px] font-medium">費用</th>
                    <th className="px-3 py-[10px] font-medium">淨額</th>
                    <th className="px-3 py-[10px] font-medium">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-b border-dashboard-border transition-colors hover:bg-dashboard-chip/50"
                    >
                      <td className="px-3 py-[10px] font-mono text-[12px] text-dashboard-faint">
                        {formatDate(trade.date, "numeric")}
                      </td>
                      <td className="px-3 py-[10px]">
                        <Link
                          href={`/portfolio/${trade.symbol}`}
                          className="font-mono text-[12.5px] font-medium text-dashboard-accent hover:underline"
                        >
                          {trade.symbol}
                        </Link>
                        <span className="ml-1 text-[12px] text-dashboard-muted">
                          {trade.name}
                        </span>
                      </td>
                      <td className="px-3 py-[10px]">
                        <Chip
                          variant={trade.side === "buy" ? "pos" : "neg"}
                        >
                          {trade.side === "buy" ? "買入" : "賣出"}
                        </Chip>
                      </td>
                      <td className="px-3 py-[10px] font-mono text-dashboard-text">
                        {trade.shares.toLocaleString()}
                      </td>
                      <td className="px-3 py-[10px] font-mono text-dashboard-muted">
                        {formatTWD(trade.price)}
                      </td>
                      <td className="px-3 py-[10px] font-mono text-dashboard-muted">
                        {formatTWD(
                          trade.grossAmount ?? trade.shares * trade.price,
                        )}
                      </td>
                      <td className="px-3 py-[10px] font-mono text-dashboard-faint">
                        {formatTWD(trade.feeTax ?? 0)}
                      </td>
                      <td className="px-3 py-[10px] font-mono text-dashboard-text">
                        {formatTWD(
                          trade.netCashflow ??
                            (trade.grossAmount ?? trade.shares * trade.price) -
                              (trade.feeTax ?? 0),
                        )}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-[10px] text-[12px] text-dashboard-faint">
                        {trade.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ────────────────────────────────────── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-dashboard-border px-3 py-3">
                <span className="text-[12px] text-dashboard-faint">
                  第 {page + 1} / {totalPages} 頁 · 共 {filtered.length} 筆
                </span>
                <div className="flex gap-1">
                  <PageBtn
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ← 上一頁
                  </PageBtn>
                  <PageBtn
                    disabled={page >= totalPages - 1}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                  >
                    下一頁 →
                  </PageBtn>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[16px] shadow-ds-card">
      <div className="text-[11.5px] text-dashboard-faint">{label}</div>
      <div className="mt-[6px] font-mono text-[17px] font-semibold text-dashboard-text">
        {value}
      </div>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-dashboard-faint">{label}</span>
      {children}
    </label>
  );
}

function PageBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-ds-sm border border-dashboard-border px-3 py-[6px] text-[12px] transition-colors ${
        disabled
          ? "cursor-not-allowed text-dashboard-faint opacity-40"
          : "text-dashboard-muted hover:bg-dashboard-chip hover:text-dashboard-text"
      }`}
    >
      {children}
    </button>
  );
}
