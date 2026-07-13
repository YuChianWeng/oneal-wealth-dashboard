import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInvestmentReconciliation } = vi.hoisted(() => ({
  mockInvestmentReconciliation: vi.fn(),
}));

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/reconciliation-repository", () => ({
  investmentReconciliation: mockInvestmentReconciliation,
}));

import { GET } from "@/app/api/portfolio/reconciliation/route";
import { SourceError } from "@/lib/errors";
import { err, ok } from "@/lib/result";

const reconciliation = {
  valuationDate: "2026-07-13",
  confirmedCash: 44_847,
  cashAsOfDate: "2026-07-12",
  cashAsOfSource: "weekly-balance-md-cron",
  cashAsOfQuality: "confirmed-explicit-event" as const,
  pendingTradeCashAdjustment: 8_743,
  effectiveCashValue: 53_590,
  holdingsMarketValue: 149_145.7,
  strategyValue: 202_735.7,
  pendingSettlements: [
    {
      id: "2026-07-13-2330.TW-sell",
      symbol: "2330.TW",
      side: "sell" as const,
      tradeDate: "2026-07-13",
      settlementDate: "2026-07-15",
      netCashflow: 8_743,
      effectiveCashAdjustment: 8_743,
      ageTradingDays: 0,
      status: "pending" as const,
    },
  ],
  status: "reconciled" as const,
  warnings: [],
};

describe("GET /api/portfolio/reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the versioned reconciliation envelope without raw paths", async () => {
    mockInvestmentReconciliation.mockReturnValue(ok(reconciliation));

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual({ version: 1, data: reconciliation });
    expect(JSON.stringify(body)).not.toContain("/home/");
    expect(JSON.stringify(body)).not.toContain("ObsidianVault");
  });

  it("returns a safe no-store error envelope for repository failure", async () => {
    mockInvestmentReconciliation.mockReturnValue(
      err(
        new SourceError(
          "Investment reconciliation source is unavailable",
          "RECONCILIATION_SOURCE_UNAVAILABLE",
          new Error("/home/ubuntu/ObsidianVault/private.md"),
        ),
      ),
    );

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toEqual({
      version: 1,
      error: {
        message: "Investment reconciliation source is unavailable",
        code: "RECONCILIATION_SOURCE_UNAVAILABLE",
      },
    });
    expect(JSON.stringify(body)).not.toContain("/home/");
  });

  it("sanitizes unexpected thrown errors", async () => {
    mockInvestmentReconciliation.mockImplementation(() => {
      throw new Error("secret /home/ubuntu/ObsidianVault");
    });

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      version: 1,
      error: { message: "Internal Server Error", code: "INTERNAL_ERROR" },
    });
  });
});
