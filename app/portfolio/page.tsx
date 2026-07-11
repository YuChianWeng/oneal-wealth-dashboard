"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { useApi } from "@/lib/hooks/use-api";
import { formatTWD, formatPercent } from "@/lib/format";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types from API
// ---------------------------------------------------------------------------

import type { PositionSummary, HoldingAllocation } from "@/lib/schemas/portfolio";

interface PortfolioResponse {
  positions: PositionSummary[];
  allocation: {
    byStock: HoldingAllocation[];
    bySector: HoldingAllocation[];
    byTheme: HoldingAllocation[];
  };
  summary: {
    totalMarketValue: number;
    totalCost: number;
    totalUnrealizedPnl: number;
    unrealizedPnlPct: number;
    positionCount: number;
  };
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortKey = "symbol" | "marketValue" | "unrealizedPnlPct" | "weight";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PortfolioPage() {
  const { data, error, isLoading, mutate } = useApi<PortfolioResponse>(
    "/api/portfolio",
  );

  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [allocTab, setAllocTab] = useState<"stock" | "sector" | "theme">(
    "sector",
  );

  // ── Derived data (always called — guards handle null/empty internally) ──
  const sorted = useMemo(() => {
    if (!data?.positions?.length) return [];
    const arr = [...data.positions];
    const totalMv = data.summary.totalMarketValue;
    arr.sort((a, b) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "symbol":
          return sortDir === "asc"
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case "marketValue":
          va = a.marketValue ?? 0;
          vb = b.marketValue ?? 0;
          break;
        case "unrealizedPnlPct":
          va = a.unrealizedPnlPct ?? 0;
          vb = b.unrealizedPnlPct ?? 0;
          break;
        case "weight":
          va = ((a.marketValue ?? 0) / (totalMv || 1)) * 100;
          vb = ((b.marketValue ?? 0) / (totalMv || 1)) * 100;
          break;
        default:
          return 0;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const allocData = useMemo(() => {
    if (!data) return [];
    if (allocTab === "stock") return data.allocation.byStock;
    if (allocTab === "sector") return data.allocation.bySector;
    return data.allocation.byTheme;
  }, [data, allocTab]);

  const unclassifiedCount = useMemo(
    () =>
      data?.positions?.filter((p) => !p.sector && !p.theme).length ?? 0,
    [data],
  );

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "持倉總覽" }}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
        <Skeleton height={400} />
      </AppShell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "持倉總覽" }}>
        <ErrorState
          message={error?.message ?? "無法載入持倉資料"}
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────
  if (data.positions.length === 0) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "持倉總覽" }}>
        <EmptyState
          title="尚無持倉"
          description="目前沒有任何開放中的持倉部位。"
        />
      </AppShell>
    );
  }

  const totalMv = data.summary.totalMarketValue;

  return (
    <AppShell navSections={stubNavSections} topbar={{ title: "持倉總覽" }}>
      {/* ── Summary cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="總市值"
          value={formatTWD(data.summary.totalMarketValue)}
          trend={data.summary.totalUnrealizedPnl >= 0 ? "up" : "down"}
          trendLabel={formatPercent(data.summary.unrealizedPnlPct, true)}
        />
        <MetricCard
          label="總成本"
          value={formatTWD(data.summary.totalCost)}
        />
        <MetricCard
          label="未實現損益"
          value={formatTWD(data.summary.totalUnrealizedPnl)}
          trend={data.summary.totalUnrealizedPnl >= 0 ? "up" : "down"}
        />
        <MetricCard
          label="持倉檔數"
          value={`${data.summary.positionCount}`}
          hint="open"
        />
      </div>

      {/* ── Holdings table ────────────────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">持倉明細</h2>
            <SortControls
              sortKey={sortKey}
              sortDir={sortDir}
              onSortKey={setSortKey}
              onSortDir={setSortDir}
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-dashboard-border text-[11.5px] uppercase tracking-[0.8px] text-dashboard-faint">
                <Th
                  label="代號"
                  active={sortKey === "symbol"}
                  dir={sortDir}
                  onClick={() => {
                    setSortKey("symbol");
                    setSortDir(
                      sortKey === "symbol" && sortDir === "asc"
                        ? "desc"
                        : "asc",
                    );
                  }}
                />
                <th className="px-3 py-[10px] font-medium">名稱</th>
                <Th
                  label="股數"
                  active={false}
                  dir="desc"
                  onClick={() => {}}
                />
                <th className="px-3 py-[10px] font-medium">均價</th>
                <th className="px-3 py-[10px] font-medium">現價</th>
                <Th
                  label="市值"
                  active={sortKey === "marketValue"}
                  dir={sortDir}
                  onClick={() => {
                    setSortKey("marketValue");
                    setSortDir(
                      sortKey === "marketValue" && sortDir === "desc"
                        ? "asc"
                        : "desc",
                    );
                  }}
                />
                <Th
                  label="損益"
                  active={sortKey === "unrealizedPnlPct"}
                  dir={sortDir}
                  onClick={() => {
                    setSortKey("unrealizedPnlPct");
                    setSortDir(
                      sortKey === "unrealizedPnlPct" && sortDir === "desc"
                        ? "asc"
                        : "desc",
                    );
                  }}
                />
                <Th
                  label="權重"
                  active={sortKey === "weight"}
                  dir={sortDir}
                  onClick={() => {
                    setSortKey("weight");
                    setSortDir(
                      sortKey === "weight" && sortDir === "desc"
                        ? "asc"
                        : "desc",
                    );
                  }}
                />
                <th className="px-3 py-[10px] font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pos) => {
                const mv = pos.marketValue ?? pos.shares * pos.avgCost;
                const weight = totalMv > 0 ? (mv / totalMv) * 100 : 0;
                const pnlVariant: StatusVariant =
                  (pos.unrealizedPnl ?? 0) > 0
                    ? "positive"
                    : (pos.unrealizedPnl ?? 0) < 0
                      ? "negative"
                      : "neutral";
                return (
                  <tr
                    key={pos.symbol}
                    className="border-b border-dashboard-border transition-colors hover:bg-dashboard-chip/50"
                  >
                    <td className="px-3 py-[10px]">
                      <Link
                        href={`/portfolio/${pos.symbol}`}
                        className="font-mono text-[12.5px] font-semibold text-dashboard-accent hover:underline"
                      >
                        {pos.symbol}
                      </Link>
                    </td>
                    <td className="px-3 py-[10px] text-dashboard-text">
                      {pos.name}
                    </td>
                    <td className="px-3 py-[10px] font-mono text-dashboard-muted">
                      {pos.shares.toLocaleString()}
                    </td>
                    <td className="px-3 py-[10px] font-mono text-dashboard-muted">
                      {formatTWD(pos.avgCost)}
                    </td>
                    <td className="px-3 py-[10px] font-mono text-dashboard-muted">
                      {pos.currentPrice != null
                        ? formatTWD(pos.currentPrice)
                        : "—"}
                    </td>
                    <td className="px-3 py-[10px] font-mono text-dashboard-text">
                      {formatTWD(mv)}
                    </td>
                    <td className="px-3 py-[10px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[12.5px] ${
                            pnlVariant === "positive"
                              ? "text-dashboard-pos"
                              : pnlVariant === "negative"
                                ? "text-dashboard-neg"
                                : "text-dashboard-muted"
                          }`}
                        >
                          {formatTWD(pos.unrealizedPnl)}
                        </span>
                        <span
                          className={`font-mono text-[11px] ${
                            pnlVariant === "positive"
                              ? "text-dashboard-pos"
                              : pnlVariant === "negative"
                                ? "text-dashboard-neg"
                                : "text-dashboard-muted"
                          }`}
                        >
                          {formatPercent(pos.unrealizedPnlPct, true)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-[10px] font-mono text-[12px] text-dashboard-muted">
                      {weight.toFixed(1)}%
                    </td>
                    <td className="px-3 py-[10px]">
                      <StatusBadge
                        variant={pnlVariant}
                        label={pos.status ?? "open"}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Allocation panel ──────────────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">配置分析</h2>
            <div className="flex gap-1 rounded-[8px] border border-dashboard-border p-[2px]">
              {(["sector", "theme", "stock"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAllocTab(tab)}
                  className={`rounded-[6px] px-3 py-[4px] text-[12px] font-medium transition-colors ${
                    allocTab === tab
                      ? "bg-dashboard-surface-2 text-dashboard-text"
                      : "bg-transparent text-dashboard-faint hover:text-dashboard-muted"
                  }`}
                >
                  {tab === "stock"
                    ? "個股"
                    : tab === "sector"
                      ? "產業"
                      : "主題"}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {allocData.length === 0 ? (
          <div className="py-4 text-center text-[13px] text-dashboard-faint">
            {allocTab === "theme"
              ? "尚無主題分類資料"
              : allocTab === "sector"
                ? "尚無產業分類資料"
                : "尚無個股資料"}
          </div>
        ) : (
          <div className="space-y-[10px]">
            {allocData.map((a) => (
              <div key={a.category} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[13px] text-dashboard-text">
                      {a.category}
                    </span>
                    <span className="font-mono text-[12px] text-dashboard-muted">
                      {a.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-[6px] w-full overflow-hidden rounded-full bg-dashboard-chip">
                    <div
                      className="h-full rounded-full bg-dashboard-accent transition-all"
                      style={{ width: `${Math.min(a.percentage, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="w-[90px] text-right font-mono text-[12px] text-dashboard-faint">
                  {formatTWD(a.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Unclassified count */}
        {unclassifiedCount > 0 && (
          <div className="mt-4 border-t border-dashboard-border pt-3">
            <p className="text-[12px] text-dashboard-warn">
              ⚠ {unclassifiedCount} 檔股票尚未設定產業或主題分類
            </p>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Sortable table header cell. */
function Th({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-[10px] font-medium">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-[11.5px] uppercase tracking-[0.8px] text-dashboard-faint hover:text-dashboard-muted"
      >
        {label}
        {active ? (
          <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>
        ) : null}
      </button>
    </th>
  );
}

/** Sort controls row. */
function SortControls({
  sortKey,
  sortDir,
  onSortKey,
  onSortDir,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSortKey: (k: SortKey) => void;
  onSortDir: (d: SortDir) => void;
}) {
  const options: { key: SortKey; label: string }[] = [
    { key: "marketValue", label: "市值" },
    { key: "unrealizedPnlPct", label: "損益%" },
    { key: "weight", label: "權重" },
    { key: "symbol", label: "代號" },
  ];
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-dashboard-faint">排序:</span>
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => {
            if (sortKey === opt.key) {
              onSortDir(sortDir === "asc" ? "desc" : "asc");
            } else {
              onSortKey(opt.key);
              onSortDir("desc");
            }
          }}
          className={`rounded-[5px] px-[7px] py-[2px] text-[11px] font-medium transition-colors ${
            sortKey === opt.key
              ? "bg-dashboard-surface-2 text-dashboard-text"
              : "text-dashboard-faint hover:text-dashboard-muted"
          }`}
        >
          {opt.label}
          {sortKey === opt.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
        </button>
      ))}
    </div>
  );
}
