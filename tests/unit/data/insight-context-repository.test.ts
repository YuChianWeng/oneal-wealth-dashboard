import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));

const sourceMocks = vi.hoisted(() => ({
  investmentReconciliationInsightStateFromSources: vi.fn(),
  loadTradeInsightSources: vi.fn(),
  loanInvestmentPerformance: vi.fn(),
  benchmarkSeries: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  config: { insightCashStaleDays: 11 },
}));
vi.mock("@/lib/data/reconciliation-repository", () => ({
  investmentReconciliationInsightStateFromSources:
    sourceMocks.investmentReconciliationInsightStateFromSources,
}));
vi.mock("@/lib/data/portfolio-repository", () => ({
  loadTradeInsightSources: sourceMocks.loadTradeInsightSources,
}));
vi.mock("@/lib/data/loan-investment-repository", () => ({
  loanInvestmentPerformance: sourceMocks.loanInvestmentPerformance,
}));
vi.mock("@/lib/data/benchmark-repository", () => ({
  benchmarkSeries: sourceMocks.benchmarkSeries,
}));

import { loadPhaseOneInsightContext } from "@/lib/data/insight-context-repository";

const now = new Date("2026-07-14T03:04:05.000Z");

function sourceError(code: string) {
  return {
    ok: false as const,
    error: {
      code,
      message: "private failure at /home/ubuntu/ObsidianVault/private.json",
      cause: new Error("raw source details"),
    },
  };
}

function arrangeSuccess() {
  sourceMocks.investmentReconciliationInsightStateFromSources.mockReturnValue({
    ok: true,
    value: {
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: [
          {
            id: "trade-1",
            symbol: "2330.TW",
            status: "overdue",
            settlementDate: "2026-07-11",
            netCashflow: -1000,
          },
        ],
        warnings: ["must not be exposed"],
      },
      strategyEquationDelta: 2.5,
    },
  });
  sourceMocks.loadTradeInsightSources.mockReturnValue({
    ok: true,
    value: {
      trades: {
        ok: true,
        value: [{ id: "trade-strict", symbol: "2330.TW" }],
      },
      tradeIntegrity: {
        missingNetCashflow: [{ id: "trade-2", symbol: "0050.TW" }],
      },
    },
  });
  sourceMocks.loanInvestmentPerformance.mockReturnValue({
    ok: true,
    value: {
      economics: {
        status: "needs-review",
        statusReason:
          "Private loan policy at /home/ubuntu/ObsidianVault/policy.md",
        financingCost: null,
        grossStrategyValue: 100,
      },
      points: [{ cashAsOfSource: "private/path" }],
    },
  });
  sourceMocks.benchmarkSeries.mockReturnValue({
    ok: true,
    value: {
      freshness: "unavailable",
      latestDate: "2026-07-13",
      expectedLatestDate: null,
      warnings: ["private path must not be exposed"],
      points: [],
    },
  });
}

describe("loadPhaseOneInsightContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    arrangeSuccess();
  });

  it("maps successful typed sources exactly and calls each source once", () => {
    const context = loadPhaseOneInsightContext(now);

    expect(context).toEqual({
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: [
          { id: "trade-1", symbol: "2330.TW", status: "overdue" },
        ],
        strategyEquationDelta: 2.5,
      },
      tradeIntegrity: {
        missingNetCashflow: [{ id: "trade-2", symbol: "0050.TW" }],
      },
      financing: {
        status: "needs-review",
        statusReason: null,
      },
      benchmark0050: {
        sourceStatus: "available",
        freshness: "unavailable",
        latestDate: "2026-07-13",
        expectedLatestDate: null,
      },
      cashStaleAfterDays: 11,
    });
    expect(
      sourceMocks.investmentReconciliationInsightStateFromSources,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ economics: expect.any(Object) }),
      [{ id: "trade-strict", symbol: "2330.TW" }],
    );
    expect(sourceMocks.loadTradeInsightSources).toHaveBeenCalledOnce();
    expect(sourceMocks.loanInvestmentPerformance).toHaveBeenCalledOnce();
    expect(sourceMocks.benchmarkSeries).toHaveBeenCalledOnce();
    expect(sourceMocks.benchmarkSeries).toHaveBeenCalledWith(
      "0050.TW",
      now.toISOString(),
    );
  });

  it("exposes only an allowlisted financing blocker", () => {
    sourceMocks.loanInvestmentPerformance.mockReturnValue({
      ok: true,
      value: {
        economics: {
          status: "needs-review",
          statusReason:
            "Interest baseline requires a confirmed date and amount",
          financingCost: null,
          grossStrategyValue: 100,
        },
      },
    });

    expect(loadPhaseOneInsightContext(now).financing).toEqual({
      status: "needs-review",
      statusReason: "Confirm the loan-interest baseline date and amount",
    });
  });

  it("omits reconciliation, trade integrity, and financing when unavailable", () => {
    sourceMocks.investmentReconciliationInsightStateFromSources.mockReturnValue(
      sourceError("RECONCILIATION_SOURCE_UNAVAILABLE"),
    );
    sourceMocks.loadTradeInsightSources.mockReturnValue(
      sourceError("VAULT_TRANSACTIONS_UNAVAILABLE"),
    );
    sourceMocks.loanInvestmentPerformance.mockReturnValue(
      sourceError("SOURCE_NOT_FOUND"),
    );

    const context = loadPhaseOneInsightContext(now);

    expect(context).not.toHaveProperty("reconciliation");
    expect(context).not.toHaveProperty("tradeIntegrity");
    expect(context).not.toHaveProperty("financing");
    expect(
      sourceMocks.investmentReconciliationInsightStateFromSources,
    ).not.toHaveBeenCalled();
    expect(sourceMocks.loadTradeInsightSources).toHaveBeenCalledOnce();
    expect(sourceMocks.loanInvestmentPerformance).toHaveBeenCalledOnce();
  });

  it("keeps diagnostics when strict trade parsing blocks reconciliation", () => {
    sourceMocks.loadTradeInsightSources.mockReturnValue({
      ok: true,
      value: {
        trades: sourceError("VAULT_INVALID_TRADE"),
        tradeIntegrity: {
          missingNetCashflow: [{ id: "trade-opaque", symbol: "2330.TW" }],
        },
      },
    });

    const context = loadPhaseOneInsightContext(now);

    expect(context).not.toHaveProperty("reconciliation");
    expect(context.tradeIntegrity).toEqual({
      missingNetCashflow: [{ id: "trade-opaque", symbol: "2330.TW" }],
    });
    expect(context.financing).toEqual({
      status: "needs-review",
      statusReason: null,
    });
    expect(
      sourceMocks.investmentReconciliationInsightStateFromSources,
    ).not.toHaveBeenCalled();
  });

  it("omits financing when successful performance has no economics", () => {
    sourceMocks.loanInvestmentPerformance.mockReturnValue({
      ok: true,
      value: { economics: null },
    });

    expect(loadPhaseOneInsightContext(now)).not.toHaveProperty("financing");
  });

  it("distinguishes a missing benchmark from other invalid failures", () => {
    sourceMocks.benchmarkSeries.mockReturnValue(
      sourceError("BENCHMARK_SOURCE_UNAVAILABLE"),
    );
    expect(loadPhaseOneInsightContext(now).benchmark0050).toEqual({
      sourceStatus: "missing",
      freshness: "unavailable",
      latestDate: null,
      expectedLatestDate: null,
    });

    sourceMocks.benchmarkSeries.mockReturnValue(
      sourceError("BENCHMARK_DATA_INVALID"),
    );
    expect(loadPhaseOneInsightContext(now).benchmark0050).toEqual({
      sourceStatus: "invalid",
      freshness: "unavailable",
      latestDate: null,
      expectedLatestDate: null,
    });
  });

  it("does not serialize source error or path details into the context", () => {
    sourceMocks.investmentReconciliationInsightStateFromSources.mockReturnValue(
      sourceError("RECONCILIATION_SOURCE_UNAVAILABLE"),
    );
    sourceMocks.loadTradeInsightSources.mockReturnValue(
      sourceError("VAULT_TRANSACTIONS_UNAVAILABLE"),
    );
    sourceMocks.loanInvestmentPerformance.mockReturnValue(
      sourceError("SOURCE_NOT_FOUND"),
    );
    sourceMocks.benchmarkSeries.mockReturnValue(
      sourceError("BENCHMARK_DATA_INVALID"),
    );

    const serialized = JSON.stringify(loadPhaseOneInsightContext(now));
    expect(serialized).not.toContain("/home/ubuntu");
    expect(serialized).not.toContain("private failure");
    expect(serialized).not.toContain("raw source details");
  });
});
