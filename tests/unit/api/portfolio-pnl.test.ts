import { describe, expect, it, vi } from "vitest";

const { mockListAllTrades, mockListOpenPositions } = vi.hoisted(() => ({
  mockListAllTrades: vi.fn(),
  mockListOpenPositions: vi.fn(),
}));

vi.mock("@/lib/data/portfolio-repository", () => ({
  listAllTrades: mockListAllTrades,
  listOpenPositions: mockListOpenPositions,
}));

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import { GET } from "@/app/api/portfolio/pnl/route";
import { err, ok } from "@/lib/result";
import { SourceError } from "@/lib/errors";

const position = {
  symbol: "2330.TW",
  name: "台積電",
  shares: 10,
  avgCost: 900,
  currentPrice: 950,
  marketValue: 9500,
  unrealizedPnl: 500,
  unrealizedPnlPct: 5.56,
};

const trade = {
  id: "trade-1",
  date: "2026-07-01",
  symbol: "2330.TW",
  name: "台積電",
  side: "sell" as const,
  shares: 2,
  price: 950,
  grossAmount: 1900,
  feeTax: 2,
  netCashflow: 1898,
  realizedPnl: 100,
  unrealizedPnl: null,
  realizedPnlIncludesFeeTax: true,
  dataQuality: "confirmed" as const,
};

describe("GET /api/portfolio/pnl", () => {
  it("returns PnL and fee/tax audit data with private caching", async () => {
    mockListOpenPositions.mockReturnValue(ok([position]));
    mockListAllTrades.mockReturnValue(ok([trade]));

    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.data.realized).toMatchObject({ pnl: 100, feeTax: 2 });
    expect(body.data.unrealized).toMatchObject({ pnl: 500 });
    expect(body.data.bySymbol[0]).toMatchObject({
      symbol: "2330.TW",
      realizedPnl: 100,
      unrealizedPnl: 500,
    });
    expect(body.data.feeTaxAudit.trades[0]).toMatchObject({
      id: "trade-1",
      treatment: "included-in-realized-pnl",
    });
  });

  it("fails closed when a source cannot be read", async () => {
    mockListOpenPositions.mockReturnValue(
      err(
        new SourceError("Unable to read positions", "VAULT_POSITIONS_FAILED"),
      ),
    );

    const response = GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.data).toBeUndefined();
    expect(body.error).toEqual({
      message: "Unable to read positions",
      code: "VAULT_POSITIONS_FAILED",
    });
  });
});
