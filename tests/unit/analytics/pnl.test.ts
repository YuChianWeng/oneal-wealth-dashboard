import { describe, expect, it } from "vitest";
import { computePnlAnalytics } from "@/lib/analytics/pnl";
import type { PositionSummary, TradeRecord } from "@/lib/schemas/portfolio";

const trade = (overrides: Partial<TradeRecord>): TradeRecord => ({
  id: "trade-1", date: "2026-01-01", symbol: "AAA.TW", name: "AAA",
  side: "buy", shares: 10, price: 100, netCashflow: 1000, ...overrides,
});
const position = (overrides: Partial<PositionSummary>): PositionSummary => ({
  symbol: "AAA.TW", name: "AAA", shares: 10, avgCost: 100,
  currentPrice: 120, marketValue: 1200, unrealizedPnl: 200,
  unrealizedPnlPct: 20, ...overrides,
});

describe("computePnlAnalytics", () => {
  it("aggregates confirmed partial-sell realized PnL and keeps fees separate", () => {
    const result = computePnlAnalytics({
      trades: [
        trade({ id: "buy", realizedPnl: null }),
        trade({ id: "sell", side: "sell", shares: 4, realizedPnl: 80, feeTax: 2 }),
        trade({ id: "sell-2", side: "sell", shares: 2, realizedPnl: -20, feeTax: 1 }),
      ], positions: [],
    });
    expect(result.realized).toMatchObject({ pnl: 60, status: "partial", feeTax: 3 });
  });

  it("does not derive missing full-close PnL and retains zero-share positions", () => {
    const result = computePnlAnalytics({
      trades: [trade({ side: "sell", shares: 10, realizedPnl: null })],
      positions: [position({ shares: 0, currentPrice: null, marketValue: 0, unrealizedPnl: 0 })],
    });
    expect(result.realized.status).toBe("unavailable");
    expect(result.unrealized).toMatchObject({ pnl: 0, status: "available" });
  });

  it("excludes estimated and review values without guessing", () => {
    const result = computePnlAnalytics({
      trades: [
        trade({ realizedPnl: 100, dataQuality: "estimated-fee" }),
        trade({ id: "review", realizedPnl: 100, dataQuality: "needs-review" }),
        trade({ id: "confirmed", realizedPnl: 25, dataQuality: "confirmed" }),
      ], positions: [],
    });
    expect(result.realized).toMatchObject({ pnl: 25, status: "partial", excludedTradeCount: 2 });
  });
});
