import type {
  PositionSummary,
  TradeRecord,
} from "@/lib/schemas/portfolio";

export type PnlAvailability = "available" | "partial" | "unavailable";

export interface PnlAggregate {
  pnl: number | null;
  status: PnlAvailability;
  includedTradeCount?: number;
  excludedTradeCount?: number;
  includedPositionCount?: number;
  excludedPositionCount?: number;
  /** Reported fees/taxes are kept separate; realized PnL is never recomputed. */
  feeTax?: number;
}

export interface PnlBySymbol {
  symbol: string;
  shares: number;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  feeTax: number;
}

export interface PnlAnalytics {
  realized: PnlAggregate;
  unrealized: PnlAggregate;
  bySymbol: PnlBySymbol[];
}

export interface PnlAnalyticsInput {
  trades: readonly TradeRecord[];
  positions: readonly PositionSummary[];
}

const EXCLUDED_REALIZED_QUALITY = new Set(["estimated-fee", "needs-review"]);

function usableAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function availability(included: number, excluded: number): PnlAvailability {
  if (included === 0) return "unavailable";
  return excluded === 0 ? "available" : "partial";
}

/** Aggregate only usable source-provided values; never infer missing PnL. */
export function computePnlAnalytics(input: PnlAnalyticsInput): PnlAnalytics {
  const symbols = new Map<string, PnlBySymbol>();
  const getSymbol = (symbol: string): PnlBySymbol => {
    const existing = symbols.get(symbol);
    if (existing) return existing;
    const created: PnlBySymbol = {
      symbol,
      shares: 0,
      realizedPnl: null,
      unrealizedPnl: null,
      feeTax: 0,
    };
    symbols.set(symbol, created);
    return created;
  };

  let realizedPnl = 0;
  let realizedIncluded = 0;
  let realizedExcluded = 0;
  let feeTax = 0;
  for (const trade of input.trades) {
    const bucket = getSymbol(trade.symbol);
    if (usableAmount(trade.feeTax) && trade.feeTax >= 0) {
      feeTax += trade.feeTax;
      bucket.feeTax += trade.feeTax;
    }
    if (
      usableAmount(trade.realizedPnl) &&
      !EXCLUDED_REALIZED_QUALITY.has(trade.dataQuality ?? "")
    ) {
      realizedPnl += trade.realizedPnl;
      realizedIncluded += 1;
      bucket.realizedPnl = (bucket.realizedPnl ?? 0) + trade.realizedPnl;
    } else {
      realizedExcluded += 1;
    }
  }

  let unrealizedPnl = 0;
  let unrealizedIncluded = 0;
  let unrealizedExcluded = 0;
  for (const position of input.positions) {
    const bucket = getSymbol(position.symbol);
    bucket.shares += usableAmount(position.shares) ? position.shares : 0;
    if (usableAmount(position.unrealizedPnl)) {
      unrealizedPnl += position.unrealizedPnl;
      unrealizedIncluded += 1;
      bucket.unrealizedPnl =
        (bucket.unrealizedPnl ?? 0) + position.unrealizedPnl;
    } else {
      unrealizedExcluded += 1;
    }
  }

  return {
    realized: {
      pnl: realizedIncluded > 0 ? realizedPnl : null,
      status: availability(realizedIncluded, realizedExcluded),
      includedTradeCount: realizedIncluded,
      excludedTradeCount: realizedExcluded,
      feeTax,
    },
    unrealized: {
      pnl: unrealizedIncluded > 0 ? unrealizedPnl : null,
      status: availability(unrealizedIncluded, unrealizedExcluded),
      includedPositionCount: unrealizedIncluded,
      excludedPositionCount: unrealizedExcluded,
    },
    bySymbol: [...symbols.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}
