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

import { investmentReconciliation } from "@/lib/data/reconciliation-repository";

describe("investmentReconciliation", () => {
  it("reconciles the 2026-07-13 T+2 sale against explicit per-account cash freshness", () => {
    const result = investmentReconciliation();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual(
      expect.objectContaining({
        valuationDate: "2026-07-13",
        confirmedCash: 44_847,
        cashAsOfDate: "2026-07-12",
        cashAsOfSource: "weekly-balance-md-cron",
        cashAsOfQuality: "confirmed-explicit-event",
        pendingTradeCashAdjustment: 8_743,
        effectiveCashValue: 53_590,
        holdingsMarketValue: 149_145.7,
        strategyValue: 202_735.7,
        status: "reconciled",
        warnings: [],
      }),
    );
    const pending = result.value.pendingSettlements.find(
      (item) => item.tradeDate === "2026-07-13",
    );
    expect(pending).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^trade-[0-9a-f]{64}$/),
        settlementDate: "2026-07-15",
        effectiveCashAdjustment: 8_743,
        ageTradingDays: 0,
        status: "pending",
      }),
    );
    expect(pending?.id).not.toContain("/");
  });
});
