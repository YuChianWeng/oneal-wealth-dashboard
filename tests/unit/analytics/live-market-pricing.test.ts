import { describe, expect, it } from "vitest";
import { applyLiveMarketPrices } from "@/lib/data/live-market-pricing";
import type { MarketSnapshot } from "@/lib/schemas/market";
import type { PositionSummary } from "@/lib/schemas/portfolio";

const position: PositionSummary = {
  symbol: "2330.TW",
  name: "台積電",
  shares: 10,
  avgCost: 900,
  currentPrice: 910,
  marketValue: 9100,
  unrealizedPnl: 100,
  unrealizedPnlPct: 1.11,
  sector: null,
  theme: null,
  conviction: null,
  status: "open",
};

const snapshot: MarketSnapshot = {
  version: 1,
  observedAt: "2026-07-21T17:40:00+08:00",
  stocks: [
    {
      symbol: "2330",
      name: "台積電",
      last: 950,
      reference: 900,
      change: 50,
      changePct: 5.5555,
      observedAt: "2026-07-21T17:40:00+08:00",
      providerSnapshotAt: "2026-07-21T17:39:59+08:00",
      source: "kgi",
      marketSession: "closed",
      dataStatus: "closed_snapshot",
      isStale: false,
      snapshotAgeSeconds: 1,
      contract: null,
    },
  ],
  indices: { taiex: null },
  futures: { txf: null },
  errors: [],
};

describe("applyLiveMarketPrices", () => {
  it("matches vault .TW symbols to provider bare symbols and recomputes valuation", () => {
    const [priced] = applyLiveMarketPrices([position], snapshot);
    expect(priced.currentPrice).toBe(950);
    expect(priced.marketValue).toBe(9500);
    expect(priced.unrealizedPnl).toBe(500);
    expect(priced.unrealizedPnlPct).toBeCloseTo(5.5555);
    expect(priced.priceSource).toBe("kgi");
    expect(priced.priceObservedAt).toBe("2026-07-21T17:40:00+08:00");
  });

  it("preserves the vault value when the provider has no last price", () => {
    const emptySnapshot = {
      ...snapshot,
      stocks: [{ ...snapshot.stocks[0], last: null }],
    };
    expect(applyLiveMarketPrices([position], emptySnapshot)[0]).toEqual(
      position,
    );
  });
});
