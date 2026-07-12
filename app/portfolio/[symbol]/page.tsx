"use client";

import { use } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Chip } from "@/components/ui/chip";
import { ResearchMarkdown } from "@/components/portfolio/research-markdown";
import { useApi } from "@/lib/hooks/use-api";
import { formatTWD, formatPercent, formatDate } from "@/lib/format";
import Link from "next/link";

import type { PositionSummary, TradeRecord } from "@/lib/schemas/portfolio";
import type { ResearchSummary } from "@/lib/schemas/research";

interface StockDetailResponse {
  position: PositionSummary;
  trades: TradeRecord[];
  research: ResearchSummary | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);

  const { data, error, isLoading, mutate } = useApi<StockDetailResponse>(
    `/api/portfolio/${symbol}`,
  );

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: symbol, subtitle: "載入中…" }}
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={100} />
          ))}
        </div>
        <Skeleton height={200} />
        <Skeleton height={300} />
      </AppShell>
    );
  }

  // ── Error / 404 ──────────────────────────────────────────────────────
  if (error || !data) {
    const is404 = error?.message?.includes("not found");
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: symbol }}>
        {is404 ? (
          <EmptyState
            title="找不到此股票"
            description={`「${symbol}」不在你的持倉中，或尚未開放。`}
            action={
              <Link
                href="/portfolio"
                className="rounded-ds-sm border border-dashboard-border px-4 py-[6px] text-[12px] text-dashboard-muted hover:bg-dashboard-chip"
              >
                ← 回到持倉總覽
              </Link>
            }
          />
        ) : (
          <ErrorState
            message={error?.message ?? "無法載入股票資料"}
            onRetry={() => mutate()}
          />
        )}
      </AppShell>
    );
  }

  const { position, trades, research } = data;

  const pnl = position.unrealizedPnl ?? 0;
  const pnlPct = position.unrealizedPnlPct ?? 0;
  const mv = position.marketValue ?? position.shares * position.avgCost;
  const costBasis = position.shares * position.avgCost;
  const pnlVariant = pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral";

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: `${position.symbol} — ${position.name}`,
        subtitle: `最後更新 · ${
          position.lastChecked
            ? formatDate(position.lastChecked, "numeric")
            : "—"
        }`,
      }}
    >
      {/* ── Stock header metrics ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="現價"
          value={
            position.currentPrice != null
              ? formatTWD(position.currentPrice)
              : "NT$—"
          }
        />
        <MetricCard label="持倉市值" value={formatTWD(mv)} />
        <MetricCard
          label="成本基礎"
          value={formatTWD(costBasis)}
          hint={`${position.shares.toLocaleString()} 股`}
        />
        <MetricCard
          label="未實現損益"
          value={formatTWD(pnl)}
          trend={
            pnlVariant === "positive"
              ? "up"
              : pnlVariant === "negative"
                ? "down"
                : "neutral"
          }
          trendLabel={formatPercent(pnlPct, true)}
        />
      </div>

      {/* ── Price vs cost bar ─────────────────────────────────────── */}
      {position.currentPrice != null && (
        <Card
          header={<h2 className="text-[15px] font-semibold">價格 vs 成本</h2>}
        >
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="text-dashboard-muted">均價</span>
                <span className="font-mono text-dashboard-muted">
                  {formatTWD(position.avgCost)}
                </span>
              </div>
              <div className="relative h-[8px] w-full rounded-full bg-dashboard-chip">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-dashboard-muted"
                  style={{
                    width: `${Math.min(
                      (position.avgCost / position.currentPrice) * 100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[12.5px]">
                <span className="text-dashboard-text">現價</span>
                <span
                  className={`font-mono ${
                    pnlVariant === "positive"
                      ? "text-dashboard-pos"
                      : pnlVariant === "negative"
                        ? "text-dashboard-neg"
                        : "text-dashboard-muted"
                  }`}
                >
                  {formatTWD(position.currentPrice)}
                </span>
              </div>
              <div className="relative h-[8px] w-full rounded-full bg-dashboard-chip">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full ${
                    pnlVariant === "positive"
                      ? "bg-dashboard-pos"
                      : pnlVariant === "negative"
                        ? "bg-dashboard-neg"
                        : "bg-dashboard-muted"
                  }`}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Thesis card ──────────────────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              投資論點
              {research?.conviction != null && (
                <span className="ml-2 font-normal text-dashboard-faint">
                  Conviction: {research.conviction}/5
                </span>
              )}
            </h2>
            {research?.status && (
              <Chip
                variant={
                  research.status === "hold"
                    ? "accent"
                    : research.status === "ready"
                      ? "pos"
                      : "default"
                }
              >
                {research.status}
              </Chip>
            )}
          </div>
        }
      >
        {research ? (
          <div className="space-y-4">
            {research.thesis && (
              <Section label="論點" content={research.thesis} />
            )}
            {research.catalysts && (
              <Section label="催化劑" content={research.catalysts} />
            )}
            {research.risks && (
              <Section label="風險" content={research.risks} variant="warn" />
            )}
            {research.invalidation && (
              <Section
                label="失效條件"
                content={research.invalidation}
                variant="neg"
              />
            )}
            {research.nextStep && (
              <Section
                label="下一步"
                content={research.nextStep}
                variant="accent"
              />
            )}
            {!research.thesis &&
              !research.catalysts &&
              !research.risks &&
              !research.invalidation &&
              !research.nextStep && (
                <p className="text-[13px] text-dashboard-faint">
                  此股票尚無詳細研究筆記。
                </p>
              )}
            {research.sector && (
              <div className="flex gap-2 pt-1">
                <Chip variant="default">{research.sector}</Chip>
                {research.theme && (
                  <Chip variant="accent">{research.theme}</Chip>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-dashboard-faint">
            尚無研究筆記。在 Obsidian 中建立研究筆記後將自動顯示。
          </p>
        )}
      </Card>

      {/* ── Trade timeline ───────────────────────────────────────── */}
      <Card
        header={
          <h2 className="text-[15px] font-semibold">
            交易紀錄 ({trades.length})
          </h2>
        }
      >
        {trades.length === 0 ? (
          <p className="py-2 text-[13px] text-dashboard-faint">
            尚無交易紀錄。
          </p>
        ) : (
          <div className="space-y-2">
            {trades.slice(0, 20).map((trade) => (
              <div
                key={trade.id}
                className="flex items-center gap-3 rounded-ds-sm border border-dashboard-border px-3 py-[10px]"
              >
                <Chip variant={trade.side === "buy" ? "pos" : "neg"}>
                  {trade.side === "buy" ? "買入" : "賣出"}
                </Chip>
                <span className="font-mono text-[11.5px] text-dashboard-faint">
                  {formatDate(trade.date, "numeric")}
                </span>
                <span className="font-mono text-[13px] text-dashboard-text">
                  {trade.shares.toLocaleString()} 股
                </span>
                <span className="font-mono text-[12.5px] text-dashboard-muted">
                  @ {formatTWD(trade.price)}
                </span>
                {trade.netCashflow != null && (
                  <span className="ml-auto font-mono text-[12px] text-dashboard-muted">
                    {formatTWD(trade.netCashflow)}
                  </span>
                )}
              </div>
            ))}
            {trades.length > 20 && (
              <p className="text-center text-[12px] text-dashboard-faint">
                還有 {trades.length - 20} 筆交易 —
                <Link
                  href="/portfolio/transactions"
                  className="ml-1 text-dashboard-accent hover:underline"
                >
                  查看全部
                </Link>
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── Open in Obsidian placeholder ──────────────────────────── */}
      <Card>
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] bg-dashboard-chip"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="text-dashboard-faint"
            >
              <path d="M5 2h8l3 3v8l-3 3H5l-3-3V5l3-3z" />
              <path d="M9 6v6M6 9h6" />
            </svg>
          </div>
          <div>
            <p className="text-[13px] font-medium text-dashboard-muted">
              在 Obsidian 中開啟
            </p>
            <p className="text-[11.5px] text-dashboard-faint">
              Obsidian vault 連結待驗證後啟用
            </p>
          </div>
          <button
            type="button"
            disabled
            className="ml-auto cursor-not-allowed rounded-ds-sm border border-dashboard-border px-4 py-[6px] text-[12px] text-dashboard-faint opacity-50"
          >
            前往 Obsidian
          </button>
        </div>
      </Card>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({
  label,
  content,
  variant,
}: {
  label: string;
  content: string;
  variant?: "warn" | "neg" | "accent";
}) {
  const borderColor =
    variant === "warn"
      ? "border-dashboard-warn/30"
      : variant === "neg"
        ? "border-dashboard-neg/30"
        : variant === "accent"
          ? "border-dashboard-accent/30"
          : "border-dashboard-border";

  const labelColor =
    variant === "warn"
      ? "text-dashboard-warn"
      : variant === "neg"
        ? "text-dashboard-neg"
        : variant === "accent"
          ? "text-dashboard-accent"
          : "text-dashboard-muted";

  return (
    <div
      className={`rounded-ds-sm border-l-[3px] ${borderColor} bg-dashboard-chip/30 px-3 py-2`}
    >
      <div className={`mb-1 text-[11.5px] font-semibold ${labelColor}`}>
        {label}
      </div>
      <ResearchMarkdown content={content} />
    </div>
  );
}
