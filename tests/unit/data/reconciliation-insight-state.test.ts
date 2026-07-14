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

import {
  investmentReconciliation,
  investmentReconciliationInsightState,
} from "@/lib/data/reconciliation-repository";

const point = (strategyValue: number) => ({
  date: "2026-07-13",
  isSeed: false,
  confirmedCash: 10,
  cashAsOfDate: "2026-07-13",
  cashAsOfSource: "weekly-balance-md-cron",
  cashAsOfQuality: "confirmed-explicit-event",
  pendingTradeCashAdjustment: 0,
  effectiveCashValue: 10,
  brokerageMarketValue: 20,
  strategyValue,
  pendingTradeCount: 0,
});

function useSources(strategyValue: number) {
  mockPerformance.mockReturnValue(ok({ points: [point(strategyValue)] }));
  mockTrades.mockReturnValue(ok([]));
}

describe("investmentReconciliationInsightState", () => {
  beforeEach(() => {
    mockPerformance.mockReset();
    mockTrades.mockReset();
  });

  it("returns the exact numeric snapshot-vs-reconciled strategy delta", () => {
    useSources(32.5);

    const result = investmentReconciliationInsightState();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategyEquationDelta).toBe(2.5);
    expect(result.value.reconciliation.strategyValue).toBe(30);
    expect(mockPerformance).toHaveBeenCalledTimes(1);
    expect(mockTrades).toHaveBeenCalledTimes(1);
  });

  it("returns a zero delta when the strategy equation matches", () => {
    useSources(30);

    const result = investmentReconciliationInsightState();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategyEquationDelta).toBe(0);
  });

  it("uses deterministic opaque public IDs for pending trades", () => {
    useSources(30);
    mockTrades.mockReturnValue(
      ok([
        {
          id: "order:/home/ubuntu/private-broker:customer-secret-order",
          symbol: "2330.TW",
          side: "buy",
          date: "2026-07-13",
          settlementDate: "2026-07-15",
          netCashflow: -100,
        },
      ]),
    );

    const first = investmentReconciliationInsightState();
    const second = investmentReconciliationInsightState();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const firstId = first.value.reconciliation.pendingSettlements[0]?.id;
    const secondId = second.value.reconciliation.pendingSettlements[0]?.id;
    expect(firstId).toBe(secondId);
    expect(firstId).toMatch(/^trade-[0-9a-f]{64}$/);
    const serialized = JSON.stringify(first.value.reconciliation);
    expect(serialized).not.toContain("/home/");
    expect(serialized).not.toContain("private-broker");
    expect(serialized).not.toContain("customer-secret-order");
  });

  it("keeps the public reconciliation result free of the audit wrapper", () => {
    useSources(32.5);

    const result = investmentReconciliation();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.strategyValue).toBe(30);
    expect(result.value).not.toHaveProperty("reconciliation");
    expect(result.value).not.toHaveProperty("strategyEquationDelta");
    expect(mockPerformance).toHaveBeenCalledTimes(1);
    expect(mockTrades).toHaveBeenCalledTimes(1);
  });

  it("propagates source failures instead of substituting a zero delta", () => {
    const sourceError = new SourceError(
      "Snapshot source unavailable",
      "SNAPSHOT_UNAVAILABLE",
    );
    mockPerformance.mockReturnValue(err(sourceError));

    const result = investmentReconciliationInsightState();

    expect(result).toEqual(err(sourceError));
    expect(mockTrades).not.toHaveBeenCalled();
  });
});
