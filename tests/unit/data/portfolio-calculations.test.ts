/**
 * Tests for portfolio-calculations.ts — derived portfolio metrics.
 */

import { describe, expect, it, vi } from "vitest";

// Mock server-only
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  auditPortfolioFeeTaxAccounting,
  auditTradeFeeTaxAccounting,
  computeAllocation,
  computeWeightedCost,
  computeWeightedCostFromPositions,
} from "@/lib/data/portfolio-calculations";
import type { PositionSummary } from "@/lib/schemas/portfolio";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const samplePositions: PositionSummary[] = [
  {
    symbol: "2330.TW",
    name: "TSMC",
    shares: 1000,
    avgCost: 580,
    currentPrice: 600,
    marketValue: 600000,
    unrealizedPnl: 20000,
    unrealizedPnlPct: 3.45,
    sector: "Semiconductors",
    theme: "AI / HPC",
    conviction: 5,
    status: "open",
  },
  {
    symbol: "2454.TW",
    name: "MediaTek",
    shares: 500,
    avgCost: 1200,
    currentPrice: 1250,
    marketValue: 625000,
    unrealizedPnl: 25000,
    unrealizedPnlPct: 4.17,
    sector: "Semiconductors",
    theme: "AI Edge",
    conviction: 4,
    status: "open",
  },
  {
    symbol: "0050.TW",
    name: "Yuanta Taiwan 50",
    shares: 2000,
    avgCost: 180,
    currentPrice: 185,
    marketValue: 370000,
    unrealizedPnl: 10000,
    unrealizedPnlPct: 2.78,
    sector: null,
    theme: "Broad Market",
    conviction: null,
    status: "open",
  },
  {
    symbol: "2881.TW",
    name: "Fubon Financial",
    shares: 5000,
    avgCost: 90,
    currentPrice: 92,
    marketValue: 460000,
    unrealizedPnl: 10000,
    unrealizedPnlPct: 2.22,
    sector: "Financials",
    theme: null,
    conviction: null,
    status: "open",
  },
];

// ---------------------------------------------------------------------------
// computeAllocation
// ---------------------------------------------------------------------------

describe("computeAllocation", () => {
  it("computes by-stock allocation", () => {
    const result = computeAllocation(samplePositions);

    expect(result.byStock).toHaveLength(4);

    // Total value = 600000 + 625000 + 370000 + 460000 = 2055000
    const tsmc = result.byStock.find((a) => a.category.includes("2330"));
    expect(tsmc).toBeDefined();
    expect(tsmc!.value).toBe(600000);
    expect(tsmc!.percentage).toBeCloseTo(29.2, 0);
  });

  it("computes by-sector allocation", () => {
    const result = computeAllocation(samplePositions);

    // Semiconductors: 2330 + 2454 = 600000 + 625000 = 1225000
    const semi = result.bySector.find((a) => a.category === "Semiconductors");
    expect(semi).toBeDefined();
    expect(semi!.value).toBe(1225000);
    expect(semi!.percentage).toBeCloseTo(59.61, 1);

    // Financials: 460000
    const fin = result.bySector.find((a) => a.category === "Financials");
    expect(fin).toBeDefined();
    expect(fin!.value).toBe(460000);
    expect(fin!.percentage).toBeCloseTo(22.38, 1);

    // Sorted descending by value
    for (let i = 1; i < result.bySector.length; i++) {
      expect(result.bySector[i].value <= result.bySector[i - 1].value).toBe(
        true,
      );
    }
  });

  it("computes by-theme allocation", () => {
    const result = computeAllocation(samplePositions);

    const aiHpc = result.byTheme.find((a) => a.category === "AI / HPC");
    expect(aiHpc).toBeDefined();
    expect(aiHpc!.value).toBe(600000);

    const broad = result.byTheme.find((a) => a.category === "Broad Market");
    expect(broad).toBeDefined();
    expect(broad!.value).toBe(370000);
  });

  it("identifies unclassified holdings (no sector)", () => {
    const result = computeAllocation(samplePositions);

    // Only 0050.TW has no sector
    expect(result.unclassified).toHaveLength(1);
    expect(result.unclassified[0].symbol).toBe("0050.TW");
  });

  it("handles empty positions array", () => {
    const result = computeAllocation([]);

    expect(result.byStock).toEqual([]);
    expect(result.bySector).toEqual([]);
    expect(result.byTheme).toEqual([]);
    expect(result.unclassified).toEqual([]);
  });

  it("falls back to shares * avgCost when marketValue is null", () => {
    const positions: PositionSummary[] = [
      {
        symbol: "TEST.TW",
        name: "Test",
        shares: 100,
        avgCost: 50,
        currentPrice: null,
        marketValue: null,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        sector: "TestSector",
        theme: "TestTheme",
      },
    ];

    const result = computeAllocation(positions);

    // Value should be shares * avgCost = 5000
    expect(result.byStock[0].value).toBe(5000);
    expect(result.bySector[0].value).toBe(5000);
    expect(result.byTheme[0].value).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// computeWeightedCost
// ---------------------------------------------------------------------------

describe("computeWeightedCost", () => {
  it("computes weighted average from lots", () => {
    const result = computeWeightedCost([
      { shares: 100, price: 10 },
      { shares: 200, price: 20 },
      { shares: 300, price: 30 },
    ]);

    // Total cost: 100*10 + 200*20 + 300*30 = 1000 + 4000 + 9000 = 14000
    // Total shares: 600
    // Avg: 14000 / 600 = 23.33
    expect(result).toBeCloseTo(23.33, 2);
  });

  it("returns 0 for empty lots", () => {
    expect(computeWeightedCost([])).toBe(0);
  });

  it("returns 0 when total shares is 0", () => {
    expect(computeWeightedCost([{ shares: 0, price: 100 }])).toBe(0);
  });

  it("handles single lot", () => {
    expect(computeWeightedCost([{ shares: 50, price: 200 }])).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// computeWeightedCostFromPositions
// ---------------------------------------------------------------------------

describe("computeWeightedCostFromPositions", () => {
  it("computes weighted average from position summaries", () => {
    const result = computeWeightedCostFromPositions(samplePositions);

    // Total cost: 1000*580 + 500*1200 + 2000*180 + 5000*90
    // = 580000 + 600000 + 360000 + 450000 = 1990000
    // Total shares: 1000 + 500 + 2000 + 5000 = 8500
    // Avg = 1990000 / 8500 = 234.1176...
    expect(result).toBeCloseTo(234.12, 2);
  });

  it("returns 0 for empty positions", () => {
    expect(computeWeightedCostFromPositions([])).toBe(0);
  });
});

describe("fee/tax accounting audit", () => {
  it("reconciles buy and sell cashflow with explicit fees", () => {
    expect(auditTradeFeeTaxAccounting({ side: "buy", grossAmount: 1000, feeTax: 2, netCashflow: -1002 })).toMatchObject({ status: "clean", expectedNetCashflow: -1002 });
    expect(auditTradeFeeTaxAccounting({ side: "sell", grossAmount: 450, feeTax: 1, netCashflow: 449 })).toMatchObject({ status: "clean", expectedNetCashflow: 449 });
  });

  it("does not double subtract fees already included in realized PnL", () => {
    expect(auditTradeFeeTaxAccounting({ side: "sell", grossAmount: 1000, feeTax: 10, netCashflow: 990, realizedPnl: 90, realizedPnlIncludesFeeTax: true })).toMatchObject({ status: "clean", realizedPnlAfterFeeTax: 90 });
  });

  it("flags missing, estimated, and ambiguous accounting", () => {
    expect(auditTradeFeeTaxAccounting({ side: "sell", grossAmount: 1000, netCashflow: 1000 }).status).toBe("needs-review");
    expect(auditTradeFeeTaxAccounting({ side: "buy", grossAmount: 1000, feeTax: 2, netCashflow: -1002, dataQuality: "estimated-fee" }).findings).toContain("estimated-fee-tax");
    expect(auditTradeFeeTaxAccounting({ side: "sell", grossAmount: 1000, feeTax: 10, netCashflow: 990, realizedPnl: 90 }).findings).toContain("realized-pnl-fee-tax-inclusion-unknown");
  });

  it("rolls up review status across trades", () => {
    expect(auditPortfolioFeeTaxAccounting([
      { side: "buy", grossAmount: 100, feeTax: 1, netCashflow: -101 },
      { side: "sell", grossAmount: 25, feeTax: 1, netCashflow: 25 },
    ]).status).toBe("needs-review");
  });
});
