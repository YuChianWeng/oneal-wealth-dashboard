import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "@/lib/errors";
import { err, ok } from "@/lib/result";

const { mockPerformance, mockTrades } = vi.hoisted(() => ({
  mockPerformance: vi.fn(),
  mockTrades: vi.fn(),
}));

vi.mock("@/lib/data/loan-investment-repository", () => ({
  loanInvestmentPerformance: mockPerformance,
}));
vi.mock("@/lib/data/portfolio-repository", () => ({
  listAllTrades: mockTrades,
}));
vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));

import { investmentReconciliation } from "@/lib/data/reconciliation-repository";

const point = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-07-13",
  isSeed: false,
  confirmedCash: 44_847,
  cashAsOfDate: "2026-07-12",
  cashAsOfSource: "weekly-balance-md-cron",
  cashAsOfQuality: "confirmed-explicit-event",
  pendingTradeCashAdjustment: 8_743,
  effectiveCashValue: 53_590,
  brokerageMarketValue: 149_145.7,
  strategyValue: 202_735.7,
  pendingTradeCount: 1,
  ...overrides,
});

const trade = (overrides: Record<string, unknown> = {}) => ({
  id: "order:cathay:k07Dd",
  date: "2026-07-13",
  settlementDate: "2026-07-15",
  symbol: "2330.TW",
  name: "台積電",
  side: "sell",
  shares: 5,
  price: 1749,
  grossAmount: 8745,
  feeTax: 2,
  netCashflow: 8743,
  ...overrides,
});

function useSources(
  pointOverrides: Record<string, unknown> = {},
  trades = [trade()],
) {
  mockPerformance.mockReturnValue(ok({ points: [point(pointOverrides)] }));
  mockTrades.mockReturnValue(ok(trades));
}

describe("investmentReconciliation failure modes", () => {
  beforeEach(() => {
    mockPerformance.mockReset();
    mockTrades.mockReset();
  });

  it("propagates safe upstream source errors", () => {
    mockPerformance.mockReturnValue(
      err(
        new SourceError("Snapshot source unavailable", "SNAPSHOT_UNAVAILABLE"),
      ),
    );

    const result = investmentReconciliation();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SNAPSHOT_UNAVAILABLE");
    expect(mockTrades).not.toHaveBeenCalled();
  });

  it("fails safely when no usable non-seed snapshot exists", () => {
    mockPerformance.mockReturnValue(
      ok({ points: [{ ...point(), isSeed: true }] }),
    );

    const result = investmentReconciliation();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("RECONCILIATION_SOURCE_UNAVAILABLE");
  });

  it("fails safely when required snapshot inputs are individually unavailable", () => {
    for (const field of [
      "confirmedCash",
      "cashAsOfDate",
      "brokerageMarketValue",
    ]) {
      mockPerformance.mockReturnValue(
        ok({ points: [point({ [field]: null })] }),
      );

      const result = investmentReconciliation();

      expect(result.ok, field).toBe(false);
      if (result.ok) continue;
      expect(result.error.code, field).toBe(
        "RECONCILIATION_SOURCE_UNAVAILABLE",
      );
    }
  });

  it("propagates transaction repository failures without leaking paths", () => {
    mockPerformance.mockReturnValue(ok({ points: [point()] }));
    mockTrades.mockReturnValue(
      err(
        new SourceError("Transaction source is invalid", "VAULT_INVALID_TRADE"),
      ),
    );

    const result = investmentReconciliation();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VAULT_INVALID_TRADE");
    expect(JSON.stringify(result.error)).not.toContain("/home/");
  });

  it("marks inferred cash freshness for attention", () => {
    useSources({ cashAsOfQuality: "inferred-from-balance-entry" });

    const result = investmentReconciliation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("attention");
    expect(result.value.warnings).toContain(
      "Cash freshness is inferred rather than explicitly confirmed",
    );
  });

  it("excludes duplicate business transactions and reports deterministic warnings", () => {
    useSources(
      {
        pendingTradeCashAdjustment: 0,
        effectiveCashValue: 44_847,
        strategyValue: 193_992.7,
        pendingTradeCount: 0,
      },
      [trade(), trade({ name: "duplicate file" })],
    );

    const result = investmentReconciliation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pendingSettlements).toEqual([]);
    expect(result.value.status).toBe("attention");
    expect(result.value.warnings).toHaveLength(1);
    expect(result.value.warnings[0]).toMatch(
      /^Trade trade-[0-9a-f]{64}: duplicate trade id; all copies excluded$/,
    );
    expect(result.value.warnings[0]).not.toContain("cathay");
    expect(result.value.warnings[0]).not.toContain("k07Dd");
  });

  it("reports every snapshot recomputation mismatch", () => {
    useSources({
      pendingTradeCashAdjustment: 1,
      effectiveCashValue: 2,
      strategyValue: 3,
      pendingTradeCount: 9,
    });

    const result = investmentReconciliation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("attention");
    expect(result.value.warnings).toEqual([
      "Snapshot effective cash value does not match transaction reconciliation",
      "Snapshot pending trade cash adjustment does not match transaction reconciliation",
      "Snapshot pending trade count does not match transaction reconciliation",
      "Snapshot strategy value does not match transaction reconciliation",
    ]);
  });

  it("rejects a public model with invalid freshness provenance", () => {
    useSources({ cashAsOfSource: "", cashAsOfQuality: "unknown" });

    const result = investmentReconciliation();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("RECONCILIATION_DATA_INVALID");
  });
});
