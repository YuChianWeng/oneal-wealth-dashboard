"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { useApi } from "@/lib/hooks/use-api";
import { formatDate, formatTWD } from "@/lib/format";
import { stubNavSections } from "@/lib/nav-sections";

interface PnlBySymbol {
  symbol: string;
  shares: number;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  feeTax: number;
}

interface PnlAggregate {
  pnl: number | null;
  status: "available" | "partial" | "unavailable";
  includedTradeCount?: number;
  excludedTradeCount?: number;
  includedPositionCount?: number;
  excludedPositionCount?: number;
  feeTax?: number;
}

interface AuditTrade {
  id: string;
  symbol: string;
  date: string | null;
  side: "buy" | "sell" | null;
  status: "clean" | "needs-review";
  treatment:
    | "accounted-in-cashflow"
    | "included-in-realized-pnl"
    | "not-provided"
    | "ambiguous";
  findings: string[];
}

interface PnlResponse {
  realized: PnlAggregate;
  unrealized: PnlAggregate;
  bySymbol: PnlBySymbol[];
  feeTaxAudit: {
    status: "clean" | "needs-review";
    trades: AuditTrade[];
  };
}

function availabilityLabel(status: PnlAggregate["status"]): string {
  if (status === "available") return "資料完整";
  if (status === "partial") return "部分可用";
  return "不可用";
}

function pnlTrend(value: number | null): "up" | "down" | "neutral" {
  if (value === null) return "neutral";
  return value > 0 ? "up" : value < 0 ? "down" : "neutral";
}

function pnlValue(value: number | null): string {
  return value === null ? "NT$—" : formatTWD(value);
}

function auditVariant(status: AuditTrade["status"]): StatusVariant {
  return status === "clean" ? "positive" : "warning";
}

export default function PnlPage() {
  const { data, error, isLoading, mutate } =
    useApi<PnlResponse>("/api/portfolio/pnl");

  const needsReview = useMemo(
    () =>
      data?.feeTaxAudit.trades.filter((trade) => trade.status !== "clean") ??
      [],
    [data],
  );

  if (isLoading) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "損益分析" }}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
        <Skeleton height={300} />
        <Skeleton height={260} />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "損益分析" }}>
        <ErrorState
          message={error?.message ?? "無法載入損益資料"}
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  if (data.bySymbol.length === 0) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "損益分析" }}>
        <EmptyState
          title="尚無損益資料"
          description="目前沒有可用的交易或持倉資料可以計算損益。"
        />
      </AppShell>
    );
  }

  return (
    <AppShell navSections={stubNavSections} topbar={{ title: "損益分析" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-dashboard-muted">
            來源資料計算；缺少或估算值不會被猜成 0
          </p>
        </div>
        <StatusBadge
          variant={data.feeTaxAudit.status === "clean" ? "positive" : "warning"}
          label={
            data.feeTaxAudit.status === "clean"
              ? "成本資料完整"
              : `${needsReview.length} 筆需要確認`
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="已實現損益"
          value={pnlValue(data.realized.pnl)}
          trend={pnlTrend(data.realized.pnl)}
          description={`${availabilityLabel(data.realized.status)} · ${data.realized.includedTradeCount ?? 0} 筆納入`}
        />
        <MetricCard
          label="未實現損益"
          value={pnlValue(data.unrealized.pnl)}
          trend={pnlTrend(data.unrealized.pnl)}
          description={`${availabilityLabel(data.unrealized.status)} · ${data.unrealized.includedPositionCount ?? 0} 部位納入`}
        />
        <MetricCard
          label="手續費／交易稅"
          value={formatTWD(data.realized.feeTax ?? 0)}
          hint="reported"
          description="獨立列示，不重複扣除損益"
        />
        <MetricCard
          label="待確認交易"
          value={`${needsReview.length} 筆`}
          trend={needsReview.length > 0 ? "down" : "neutral"}
          description="缺資料、估算或成本歸屬不明"
        />
      </div>

      <Card
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">個股損益</h2>
              <p className="mt-1 text-[11.5px] text-dashboard-faint">
                PnL 僅採用來源已提供且可確認的數值
              </p>
            </div>
            <span className="font-mono-dashboard text-[11px] text-dashboard-faint">
              {data.bySymbol.length} symbols
            </span>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-dashboard-border text-[11.5px] uppercase tracking-[0.8px] text-dashboard-faint">
                <th className="px-3 py-[10px] font-medium">代號</th>
                <th className="px-3 py-[10px] font-medium">股數</th>
                <th className="px-3 py-[10px] text-right font-medium">
                  已實現
                </th>
                <th className="px-3 py-[10px] text-right font-medium">
                  未實現
                </th>
                <th className="px-3 py-[10px] text-right font-medium">
                  費用／稅
                </th>
              </tr>
            </thead>
            <tbody>
              {data.bySymbol.map((item) => (
                <tr
                  key={item.symbol}
                  className="border-b border-dashboard-border/60 last:border-0"
                >
                  <td className="px-3 py-3 font-mono-dashboard text-dashboard-accent-2">
                    {item.symbol}
                  </td>
                  <td className="px-3 py-3 font-mono-dashboard text-dashboard-muted">
                    {item.shares.toLocaleString("en-US")}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono-dashboard ${
                      item.realizedPnl === null
                        ? "text-dashboard-faint"
                        : item.realizedPnl >= 0
                          ? "text-dashboard-pos"
                          : "text-dashboard-neg"
                    }`}
                  >
                    {pnlValue(item.realizedPnl)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-mono-dashboard ${
                      item.unrealizedPnl === null
                        ? "text-dashboard-faint"
                        : item.unrealizedPnl >= 0
                          ? "text-dashboard-pos"
                          : "text-dashboard-neg"
                    }`}
                  >
                    {pnlValue(item.unrealizedPnl)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono-dashboard text-dashboard-muted">
                    {formatTWD(item.feeTax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        header={
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">成本稽核</h2>
              <p className="mt-1 text-[11.5px] text-dashboard-faint">
                確認淨現金流與費用歸屬，避免重複扣除
              </p>
            </div>
            <StatusBadge
              variant={
                data.feeTaxAudit.status === "clean" ? "positive" : "warning"
              }
              label={data.feeTaxAudit.status === "clean" ? "通過" : "需要檢查"}
            />
          </div>
        }
      >
        {data.feeTaxAudit.trades.length === 0 ? (
          <p className="text-[13px] text-dashboard-faint">尚無交易可稽核。</p>
        ) : (
          <div className="space-y-2">
            {data.feeTaxAudit.trades.slice(0, 12).map((trade) => (
              <div
                key={trade.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-ds-md border border-dashboard-border/70 px-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <StatusBadge
                    variant={auditVariant(trade.status)}
                    label={trade.status === "clean" ? "OK" : "待確認"}
                  />
                  <div className="min-w-0">
                    <div className="font-mono-dashboard text-[12px] text-dashboard-accent-2">
                      {trade.symbol}
                    </div>
                    <div className="text-[11.5px] text-dashboard-faint">
                      {trade.date ? formatDate(trade.date) : "日期未確認"} ·{" "}
                      {trade.side === "buy" ? "買入" : "賣出"}
                    </div>
                  </div>
                </div>
                <div className="text-right text-[11.5px] text-dashboard-muted">
                  <div>
                    {trade.treatment === "included-in-realized-pnl"
                      ? "費用已含於已實現損益"
                      : trade.treatment === "accounted-in-cashflow"
                        ? "費用列於現金流"
                        : trade.treatment === "ambiguous"
                          ? "損益費用歸屬不明"
                          : "費用未提供"}
                  </div>
                  {trade.findings.length > 0 ? (
                    <div className="mt-1 text-dashboard-warn">
                      {trade.findings.join(" · ")}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {data.feeTaxAudit.trades.length > 12 ? (
              <p className="pt-1 text-[11.5px] text-dashboard-faint">
                僅顯示最近 12 筆，完整稽核仍以 API source 為準。
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
