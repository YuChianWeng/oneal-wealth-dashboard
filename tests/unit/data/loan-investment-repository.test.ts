import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => {
  const vaultPath = __dirname + "/../../../lib/data/__fixtures__/vault";
  return {
    config: Object.freeze({
      financeDbPath: "/tmp/test-finance.db",
      obsidianVaultPath: vaultPath,
      timezone: "Asia/Taipei",
      origin: "http://localhost:3000",
      port: 3000,
      vaultRoot: vaultPath,
      dataRoot: "/tmp/test-data",
      warnings: Object.freeze([]),
    }),
  };
});

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import { loanInvestmentPerformance } from "@/lib/data/loan-investment-repository";

describe("loanInvestmentPerformance audit fields", () => {
  it("maps seed nulls and latest per-account cash provenance", () => {
    const result = loanInvestmentPerformance();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.points[0]).toEqual(
      expect.objectContaining({
        date: "2026-06-20",
        confirmedCash: null,
        cashAsOfDate: null,
        cashAsOfSource: "unavailable",
        cashAsOfQuality: "unavailable",
        pendingTradeCashAdjustment: 0,
        pendingTradeCount: 0,
        effectiveCashValue: null,
        brokerageMarketValue: null,
      }),
    );
    expect(result.value.points.at(-1)).toEqual(
      expect.objectContaining({
        date: "2026-07-13",
        strategyValue: 202_735.7,
        confirmedCash: 44_847,
        cashAsOfDate: "2026-07-12",
        cashAsOfSource: "weekly-balance-md-cron",
        cashAsOfQuality: "confirmed-explicit-event",
        pendingTradeCashAdjustment: 8_743,
        pendingTradeCount: 1,
        effectiveCashValue: 53_590,
        brokerageMarketValue: 149_145.7,
      }),
    );
  });
});
