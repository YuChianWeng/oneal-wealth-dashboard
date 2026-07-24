"use client";

import { useApi } from "@/lib/hooks/use-api";
import type { LiveMarketQuote, MarketSnapshot } from "@/lib/schemas/market";

function formatPrice(value: number | null): string {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function formatChange(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function marketSourceLabel(source: LiveMarketQuote["source"]): string {
  switch (source) {
    case "twse":
      return "TWSE MIS";
    case "taifex":
      return "TAIFEX MIS";
    case "kgi":
      return "KGI Gateway";
    default:
      return "行情來源";
  }
}

function changeClass(change: number | null): string {
  if (change === null || change === 0) return "text-dashboard-muted";
  return change > 0 ? "text-dashboard-pos" : "text-dashboard-neg";
}

function sessionLabel(quote: LiveMarketQuote | null, fallback: string): string {
  if (!quote) return fallback;
  if (quote.marketSession === "night") return "夜盤";
  if (quote.marketSession === "day") return "日盤";
  return "收盤快照";
}

function quoteSourceLine(quote: LiveMarketQuote | null): string {
  if (!quote) return "等待資料";
  const providerTime = formatTime(quote.providerSnapshotAt ?? quote.observedAt);
  const observedTime = formatTime(quote.observedAt);
  return `來源 ${marketSourceLabel(quote.source)} · 報價 ${providerTime} · 讀取 ${observedTime}${quote.isStale ? " · 資料較舊" : ""}`;
}

function QuoteCard({
  label,
  quote,
}: {
  label: string;
  quote: LiveMarketQuote | null;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-[10px] border border-dashboard-border bg-dashboard-bg/35 px-[13px] py-[10px]">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-dashboard-faint">
          {label}
        </span>
        <span className="whitespace-nowrap rounded-[20px] border border-dashboard-border px-[6px] py-[2px] font-mono text-[10px] text-dashboard-faint">
          {sessionLabel(quote, "無資料")}
        </span>
      </div>
      <div className="mt-[5px] flex items-baseline justify-between gap-2">
        <span className="font-mono text-[20px] font-semibold tracking-[-0.3px]">
          {formatPrice(quote?.last ?? null)}
        </span>
        <span
          className={`font-mono text-[12px] ${changeClass(quote?.change ?? null)}`}
        >
          {formatChange(quote?.change ?? null)}
          {quote?.changePct !== null && quote?.changePct !== undefined
            ? ` (${formatChange(quote.changePct)}%)`
            : ""}
        </span>
      </div>
      <div className="mt-[4px] text-[10px] text-dashboard-faint">
        {quoteSourceLine(quote)}
      </div>
    </div>
  );
}

function tickerStatusClass(data: MarketSnapshot | undefined): string {
  if (!data) return "bg-dashboard-warn";
  const quotes = [data.indices.taiex, data.futures.txf].filter(
    (quote): quote is LiveMarketQuote => quote !== null,
  );
  const hasLiveQuote = quotes.some(
    (quote) => quote.dataStatus === "live" && !quote.isStale && quote.last !== null,
  );
  return hasLiveQuote ? "bg-dashboard-pos" : "bg-dashboard-warn";
}

/** Global one-minute ticker for TAIEX and TXF day/night quotes. */
export function LiveMarketTicker() {
  const { data, error, isLoading, isValidating } = useApi<MarketSnapshot>(
    "/api/market/snapshot",
    {
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      refreshWhenHidden: true,
    },
  );

  const updateLabel = data
    ? `快照 ${formatTime(data.observedAt)}${isValidating ? " · 更新中" : ""}`
    : isLoading
      ? "行情載入中…"
      : error
        ? "行情服務未就緒"
        : "等待行情";

  return (
    <section
      aria-label="即時行情"
      className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[14px_16px] shadow-ds-card"
    >
      <div className="mb-[10px] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-[9px]">
          <span
            aria-hidden="true"
            className={`h-[7px] w-[7px] rounded-full ${tickerStatusClass(data)}`}
          />
          <h2 className="m-0 text-[14px] font-semibold">即時行情</h2>
          <span className="text-[11px] text-dashboard-faint">每分鐘更新</span>
        </div>
        <span className="font-mono text-[10.5px] text-dashboard-faint">
          {updateLabel}
        </span>
      </div>
      {error && !data ? (
        <div className="rounded-[9px] border border-dashboard-border bg-dashboard-bg/35 px-3 py-3 text-[12px] text-dashboard-warn">
          {error.message}
        </div>
      ) : (
        <div className="flex flex-col gap-[9px] md:flex-row">
          <QuoteCard
            label="發行量加權股價指數 · TAIEX"
            quote={data?.indices.taiex ?? null}
          />
          <QuoteCard
            label={`臺指期 · TXF · ${sessionLabel(data?.futures.txf ?? null, "")}`}
            quote={data?.futures.txf ?? null}
          />
        </div>
      )}
    </section>
  );
}
