import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { MarketSnapshot } from "@/lib/schemas/market";

/** Normalize a Taiwan provider symbol for matching vault symbols. */
export function canonicalMarketSymbol(value: string): string {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{4,6})(?:\.(?:TW|TWO))?$/);
  return match ? match[1] : normalized;
}

function positionValue(
  position: PositionSummary,
  currentPrice: number,
): number {
  return position.shares * currentPrice;
}

/**
 * Overlay the latest host-produced quotes onto read-only position view models.
 *
 * A stale quote is still used for valuation, but its provenance is preserved so
 * the UI can distinguish a delayed last-known price from a live observation.
 */
export function applyLiveMarketPrices(
  positions: PositionSummary[],
  snapshot: MarketSnapshot,
): PositionSummary[] {
  const quotes = new Map(
    snapshot.stocks.map((quote) => [
      canonicalMarketSymbol(quote.symbol),
      quote,
    ]),
  );

  return positions.map((position) => {
    const quote = quotes.get(canonicalMarketSymbol(position.symbol));
    if (!quote || quote.last === null) return position;

    const marketValue = positionValue(position, quote.last);
    const cost = position.shares * position.avgCost;
    const unrealizedPnl = marketValue - cost;
    const unrealizedPnlPct = cost > 0 ? (unrealizedPnl / cost) * 100 : null;

    return {
      ...position,
      currentPrice: quote.last,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPct,
      priceSource: quote.source,
      priceObservedAt: quote.observedAt,
      priceIsStale: quote.isStale,
    };
  });
}
