import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  InvestmentReconciliationSchema,
  PendingSettlementSchema,
} from "@/lib/schemas/reconciliation";

const pendingSettlement = {
  id: "trade-2330-sell",
  symbol: "2330.TW",
  side: "sell" as const,
  tradeDate: "2026-07-13",
  settlementDate: "2026-07-15",
  settlementDateQuality: "canonical" as const,
  netCashflow: 8_743,
  effectiveCashAdjustment: 8_743,
  ageTradingDays: 0,
  status: "pending" as const,
};

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
  pendingSettlements: [pendingSettlement],
  status: "reconciled" as const,
  warnings: [],
};

describe("PendingSettlementSchema", () => {
  it("accepts the complete pending settlement contract", () => {
    expect(PendingSettlementSchema.parse(pendingSettlement)).toEqual(
      pendingSettlement,
    );
  });

  it("accepts unavailable trading-day age without dropping the settlement", () => {
    expect(
      PendingSettlementSchema.parse({
        ...pendingSettlement,
        ageTradingDays: null,
      }).ageTradingDays,
    ).toBeNull();
  });

  it("rejects extra fields", () => {
    expect(() =>
      PendingSettlementSchema.parse({
        ...pendingSettlement,
        sourcePath: "/private/vault/trade.md",
      }),
    ).toThrow();
  });

  it("rejects invalid dates and non-finite amounts", () => {
    expect(() =>
      PendingSettlementSchema.parse({
        ...pendingSettlement,
        tradeDate: "2026-02-30",
      }),
    ).toThrow();
    expect(() =>
      PendingSettlementSchema.parse({
        ...pendingSettlement,
        effectiveCashAdjustment: Number.NaN,
      }),
    ).toThrow();
  });
});

describe("InvestmentReconciliationSchema", () => {
  it("accepts the strict reconciliation view model", () => {
    expect(InvestmentReconciliationSchema.parse(reconciliation)).toEqual(
      reconciliation,
    );
  });

  it("requires explicit cash freshness provenance", () => {
    const { cashAsOfSource: _source, ...withoutSource } = reconciliation;
    const { cashAsOfQuality: _quality, ...withoutQuality } = reconciliation;

    expect(() => InvestmentReconciliationSchema.parse(withoutSource)).toThrow();
    expect(() => InvestmentReconciliationSchema.parse(withoutQuality)).toThrow();
  });

  it("rejects path-like public provenance", () => {
    expect(() =>
      InvestmentReconciliationSchema.parse({
        ...reconciliation,
        cashAsOfSource:
          "/home/ubuntu/ObsidianVault/Finance/Entries/2026-07-12.md",
      }),
    ).toThrow();
  });

  it("accepts zero holdings after a complete liquidation", () => {
    const zeroHoldings = {
      ...reconciliation,
      holdingsMarketValue: 0,
      strategyValue: reconciliation.effectiveCashValue,
    };

    expect(InvestmentReconciliationSchema.parse(zeroHoldings)).toEqual(
      zeroHoldings,
    );
  });

  it("rejects extra top-level and nested fields", () => {
    expect(() =>
      InvestmentReconciliationSchema.parse({
        ...reconciliation,
        rawFrontmatter: {},
      }),
    ).toThrow();

    expect(() =>
      InvestmentReconciliationSchema.parse({
        ...reconciliation,
        pendingSettlements: [{ ...pendingSettlement, rawNetCashflow: "+8743" }],
      }),
    ).toThrow();
  });
});
