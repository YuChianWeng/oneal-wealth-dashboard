import { describe, expect, it } from "vitest";
import {
  computeInvestmentReconciliation,
  type CashReconciliationInput,
  type CashReconciliationTrade,
} from "@/lib/analytics/cash-reconciliation";

const baseInput = (
  overrides: Partial<CashReconciliationInput> = {},
): CashReconciliationInput => ({
  valuationDate: "2026-07-13",
  confirmedCash: 44_847,
  cashAsOfDate: "2026-07-12",
  holdingsMarketValue: 149_145.7,
  trades: [],
  ...overrides,
});

const trade = (
  overrides: Partial<CashReconciliationTrade> = {},
): CashReconciliationTrade => ({
  id: "trade-2330-sell",
  symbol: "2330.TW",
  side: "sell",
  tradeDate: "2026-07-13",
  settlementDate: "2026-07-15",
  netCashflow: 8_743,
  ...overrides,
});

describe("computeInvestmentReconciliation", () => {
  it("returns a clean reconciled state when there are no trades", () => {
    const result = computeInvestmentReconciliation(baseInput());

    expect(result.pendingTradeCashAdjustment).toBe(0);
    expect(result.effectiveCashValue).toBe(44_847);
    expect(result.strategyValue).toBe(193_992.7);
    expect(result.pendingSettlements).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.status).toBe("reconciled");
  });

  it("reconciles the 2026-07-13 sale regression without changing confirmed cash", () => {
    const result = computeInvestmentReconciliation(
      baseInput({ trades: [trade()] }),
    );

    expect(result).toEqual({
      valuationDate: "2026-07-13",
      confirmedCash: 44_847,
      cashAsOfDate: "2026-07-12",
      pendingTradeCashAdjustment: 8_743,
      effectiveCashValue: 53_590,
      holdingsMarketValue: 149_145.7,
      strategyValue: 202_735.7,
      pendingSettlements: [
        {
          id: "trade-2330-sell",
          symbol: "2330.TW",
          side: "sell",
          tradeDate: "2026-07-13",
          settlementDate: "2026-07-15",
          netCashflow: 8_743,
          effectiveCashAdjustment: 8_743,
          ageTradingDays: 0,
          status: "pending",
        },
      ],
      status: "reconciled",
      warnings: [],
    });
  });

  it("treats a buy after the cash date as a payable", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        holdingsMarketValue: 75_000,
        trades: [
          trade({
            id: "trade-0050-buy",
            symbol: "0050.TW",
            side: "buy",
            netCashflow: -20_000,
          }),
        ],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(-20_000);
    expect(result.effectiveCashValue).toBe(24_847);
    expect(result.strategyValue).toBe(99_847);
    expect(result.pendingSettlements[0].effectiveCashAdjustment).toBe(-20_000);
    expect(result.status).toBe("reconciled");
  });

  it("normalizes cashflow signs from side and flags source sign mismatches", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        trades: [
          trade({ id: "buy-positive", side: "buy", netCashflow: 400 }),
          trade({ id: "sell-negative", side: "sell", netCashflow: -900 }),
        ],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(500);
    expect(
      result.pendingSettlements.map((item) => item.effectiveCashAdjustment),
    ).toEqual([-400, 900]);
    expect(result.status).toBe("attention");
    expect(result.warnings).toEqual([
      "Trade buy-positive: netCashflow sign does not match side",
      "Trade sell-negative: netCashflow sign does not match side",
    ]);
  });

  it("aggregates mixed trades and sorts them by trade date then id", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-14",
        trades: [
          trade({
            id: "z-sell",
            symbol: "2454.TW",
            netCashflow: 2_000,
          }),
          trade({
            id: "later-sell",
            symbol: "0050.TW",
            tradeDate: "2026-07-14",
            settlementDate: "2026-07-16",
            netCashflow: -1_000,
          }),
          trade({
            id: "a-buy",
            side: "buy",
            netCashflow: -500,
          }),
        ],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(2_500);
    expect(result.pendingSettlements.map((item) => item.id)).toEqual([
      "a-buy",
      "z-sell",
      "later-sell",
    ]);
    expect(
      result.pendingSettlements.map((item) => item.ageTradingDays),
    ).toEqual([1, 1, 0]);
  });

  it("marks a trade covered only when cash is confirmed on or after settlement", () => {
    const beforeSettlement = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-14",
        cashAsOfDate: "2026-07-14",
        trades: [trade()],
      }),
    );
    expect(beforeSettlement.pendingTradeCashAdjustment).toBe(8_743);
    expect(beforeSettlement.pendingSettlements[0]).toEqual(
      expect.objectContaining({
        id: "trade-2330-sell",
        effectiveCashAdjustment: 8_743,
        status: "pending",
      }),
    );

    const onSettlement = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-15",
        cashAsOfDate: "2026-07-15",
        trades: [trade()],
      }),
    );
    expect(onSettlement.pendingTradeCashAdjustment).toBe(0);
    expect(onSettlement.effectiveCashValue).toBe(44_847);
    expect(onSettlement.pendingSettlements).toEqual([
      expect.objectContaining({
        id: "trade-2330-sell",
        effectiveCashAdjustment: 0,
        status: "covered-by-cash-snapshot",
      }),
    ]);
    expect(onSettlement.status).toBe("reconciled");
  });

  it("excludes every record sharing a duplicate trade id instead of double-counting", () => {
    const duplicate = trade({ id: "duplicate-trade" });
    const result = computeInvestmentReconciliation(
      baseInput({ trades: [duplicate, { ...duplicate }] }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(0);
    expect(result.pendingSettlements).toEqual([]);
    expect(result.status).toBe("attention");
    expect(result.warnings).toEqual([
      "Trade duplicate-trade: duplicate trade id; all copies excluded",
    ]);
  });

  it("warns on missing, zero, and invalid cashflow without counting the trades", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        trades: [
          trade({ id: "missing-cashflow", netCashflow: undefined }),
          trade({ id: "zero-cashflow", netCashflow: 0 }),
          trade({ id: "invalid-cashflow", netCashflow: Number.NaN }),
        ],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(0);
    expect(result.pendingSettlements).toEqual([]);
    expect(result.status).toBe("attention");
    expect(result.warnings).toEqual([
      "Trade invalid-cashflow: missing or invalid netCashflow",
      "Trade missing-cashflow: missing or invalid netCashflow",
      "Trade zero-cashflow: missing or invalid netCashflow",
    ]);
  });

  it("warns on an invalid trade date and excludes it from arithmetic", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        trades: [trade({ id: "invalid-date", tradeDate: "2026-02-30" })],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(0);
    expect(result.effectiveCashValue).toBe(44_847);
    expect(result.pendingSettlements).toEqual([]);
    expect(result.status).toBe("attention");
    expect(result.warnings).toEqual([
      "Trade invalid-date: invalid tradeDate (2026-02-30)",
    ]);
  });

  it("preserves cash arithmetic when verified calendar age is unavailable", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2027-01-05",
        cashAsOfDate: "2027-01-01",
        trades: [
          trade({
            id: "outside-calendar",
            tradeDate: "2027-01-04",
            settlementDate: "2027-01-06",
            netCashflow: 1_000,
          }),
        ],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(1_000);
    expect(result.effectiveCashValue).toBe(45_847);
    expect(result.pendingSettlements[0]).toEqual(
      expect.objectContaining({
        id: "outside-calendar",
        ageTradingDays: null,
        effectiveCashAdjustment: 1_000,
      }),
    );
    expect(result.status).toBe("attention");
    expect(result.warnings).toEqual([
      "Trade outside-calendar: trading-day age unavailable",
    ]);
  });

  it("does not clear a missing-settlement trade with a T+1 cash snapshot", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-16",
        cashAsOfDate: "2026-07-14",
        trades: [trade({ id: "missing-tplus-one", settlementDate: null })],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(8_743);
    expect(result.pendingSettlements[0]).toEqual(
      expect.objectContaining({
        id: "missing-tplus-one",
        ageTradingDays: 3,
        status: "overdue",
        effectiveCashAdjustment: 8_743,
      }),
    );
    expect(result.warnings).toContain(
      "Trade missing-tplus-one: settlementDate missing; coverage inferred as 2026-07-15",
    );
  });

  it("clears a missing-settlement trade only on inferred T+2", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-16",
        cashAsOfDate: "2026-07-15",
        trades: [trade({ id: "missing-tplus-two", settlementDate: null })],
      }),
    );

    expect(result.pendingTradeCashAdjustment).toBe(0);
    expect(result.pendingSettlements[0]).toEqual(
      expect.objectContaining({
        id: "missing-tplus-two",
        status: "covered-by-cash-snapshot",
        effectiveCashAdjustment: 0,
      }),
    );
    expect(result.warnings).toEqual([
      "Trade missing-tplus-two: settlementDate missing; coverage inferred as 2026-07-15",
    ]);
  });

  it("marks a missing-settlement trade overdue after verified T+2", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-16",
        trades: [trade({ id: "missing-settlement", settlementDate: null })],
      }),
    );

    expect(result.pendingSettlements[0]).toEqual(
      expect.objectContaining({
        id: "missing-settlement",
        ageTradingDays: 3,
        status: "overdue",
      }),
    );
    expect(result.warnings).toEqual([
      "Trade missing-settlement: settlement overdue as of 2026-07-16",
      "Trade missing-settlement: settlementDate missing; coverage inferred as 2026-07-15",
    ]);
  });

  it("rejects impossible holdings and future cash snapshots", () => {
    expect(() =>
      computeInvestmentReconciliation(baseInput({ holdingsMarketValue: -1 })),
    ).toThrow("holdingsMarketValue must be nonnegative");
    expect(() =>
      computeInvestmentReconciliation(
        baseInput({ cashAsOfDate: "2026-07-14" }),
      ),
    ).toThrow("cashAsOfDate cannot be after valuationDate");
  });

  it("accepts zero holdings after complete liquidation", () => {
    const result = computeInvestmentReconciliation(
      baseInput({ holdingsMarketValue: 0, trades: [trade()] }),
    );

    expect(result.holdingsMarketValue).toBe(0);
    expect(result.strategyValue).toBe(53_590);
    expect(result.status).toBe("reconciled");
  });

  it("marks settlement-date mismatches and overdue trades for attention", () => {
    const result = computeInvestmentReconciliation(
      baseInput({
        valuationDate: "2026-07-16",
        trades: [
          trade({
            id: "overdue",
            settlementDate: "2026-07-15",
          }),
          trade({
            id: "date-mismatch",
            tradeDate: "2026-07-14",
            settlementDate: "2026-07-13",
          }),
        ],
      }),
    );

    expect(result.pendingSettlements).toEqual([
      expect.objectContaining({ id: "overdue", status: "overdue" }),
      expect.objectContaining({
        id: "date-mismatch",
        settlementDate: null,
        status: "pending",
      }),
    ]);
    expect(result.status).toBe("attention");
    expect(result.warnings).toEqual([
      "Trade date-mismatch: settlementDate invalid; coverage inferred as 2026-07-16",
      "Trade date-mismatch: settlementDate precedes tradeDate",
      "Trade overdue: settlement overdue as of 2026-07-16",
    ]);
  });

  it("produces stable settlement ordering and warnings for reordered inputs", () => {
    const inputs = [
      trade({ id: "valid-b", symbol: "B.TW" }),
      trade({ id: "bad-date", tradeDate: "not-a-date" }),
      trade({ id: "valid-a", symbol: "A.TW" }),
      trade({ id: "bad-cash", netCashflow: undefined }),
    ];

    const forward = computeInvestmentReconciliation(
      baseInput({ trades: inputs }),
    );
    const reversed = computeInvestmentReconciliation(
      baseInput({ trades: [...inputs].reverse() }),
    );

    expect(reversed).toEqual(forward);
    expect(forward.pendingSettlements.map((item) => item.id)).toEqual([
      "valid-a",
      "valid-b",
    ]);
    expect(forward.warnings).toEqual([
      "Trade bad-cash: missing or invalid netCashflow",
      "Trade bad-date: invalid tradeDate (not-a-date)",
    ]);
  });
});
