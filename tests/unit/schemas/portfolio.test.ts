import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  PositionSummarySchema,
  HoldingAllocationSchema,
  TradeRecordSchema,
  SnapshotPointSchema,
  PerformanceSeriesSchema,
  StockThesisSchema,
} from "@/lib/schemas/portfolio";

// ---------------------------------------------------------------------------
// PositionSummary
// ---------------------------------------------------------------------------
describe("PositionSummarySchema", () => {
  const valid = {
    symbol: "2330.TW",
    name: "TSMC",
    shares: 1000,
    avgCost: 580,
    currentPrice: 600,
    marketValue: 600000,
    unrealizedPnl: 20000,
    unrealizedPnlPct: 3.45,
  };

  it("accepts valid position summary", () => {
    expect(PositionSummarySchema.parse(valid)).toEqual(valid);
  });

  it("accepts null for optional nullable fields", () => {
    const data = {
      ...valid,
      sector: null,
      theme: null,
      conviction: null,
      currentPrice: null,
      marketValue: null,
      unrealizedPnl: null,
      unrealizedPnlPct: null,
    };
    expect(PositionSummarySchema.parse(data)).toEqual(data);
  });

  it("rejects extra fields (strict mode)", () => {
    expect(() =>
      PositionSummarySchema.parse({ ...valid, notePath: "/vault/2330.md" }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() => PositionSummarySchema.parse({ symbol: "2330.TW" })).toThrow();
  });

  it("rejects non-finite shares", () => {
    expect(() =>
      PositionSummarySchema.parse({ ...valid, shares: NaN }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// HoldingAllocation
// ---------------------------------------------------------------------------
describe("HoldingAllocationSchema", () => {
  it("accepts valid data", () => {
    const data = {
      category: "Semiconductors",
      value: 600000,
      percentage: 45.2,
    };
    expect(HoldingAllocationSchema.parse(data)).toEqual(data);
  });

  it("rejects extra fields", () => {
    expect(() =>
      HoldingAllocationSchema.parse({
        category: "Tech",
        value: 100,
        percentage: 10,
        rawId: 1,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TradeRecord
// ---------------------------------------------------------------------------
describe("TradeRecordSchema", () => {
  const valid = {
    id: "txn-001",
    date: "2026-07-10",
    settlementDate: "2026-07-14",
    symbol: "2330.TW",
    name: "TSMC",
    side: "buy" as const,
    shares: 500,
    price: 590,
  };

  it("accepts valid trade record", () => {
    expect(TradeRecordSchema.parse(valid)).toEqual(valid);
  });

  it("rejects invalid side", () => {
    expect(() => TradeRecordSchema.parse({ ...valid, side: "hold" })).toThrow();
  });

  it("rejects extra fields", () => {
    expect(() =>
      TradeRecordSchema.parse({ ...valid, unknownField: "should-fail" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SnapshotPoint
// ---------------------------------------------------------------------------
describe("SnapshotPointSchema", () => {
  it("accepts valid data", () => {
    const data = {
      date: "2026-07-01",
      totalValue: 5_000_000,
      externalCashFlow: 0,
      benchmarkClose: null,
    };
    expect(SnapshotPointSchema.parse(data)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// PerformanceSeries
// ---------------------------------------------------------------------------
describe("PerformanceSeriesSchema", () => {
  it("accepts valid data", () => {
    const data = { period: "1M" as const, return: 2.5 };
    expect(PerformanceSeriesSchema.parse(data)).toEqual(data);
  });

  it("rejects invalid period", () => {
    expect(() =>
      PerformanceSeriesSchema.parse({ period: "5Y", return: 10.0 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// StockThesis
// ---------------------------------------------------------------------------
describe("StockThesisSchema", () => {
  it("accepts valid data", () => {
    const data = {
      symbol: "2330.TW",
      thesis: "Global semiconductor leader with structural demand growth",
      conviction: 4,
    };
    expect(StockThesisSchema.parse(data)).toEqual(data);
  });

  it("rejects conviction outside 1-5 range", () => {
    expect(() =>
      StockThesisSchema.parse({
        symbol: "2330.TW",
        thesis: "ok",
        conviction: 6,
      }),
    ).toThrow();
  });
});
