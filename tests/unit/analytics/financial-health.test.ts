/**
 * Tests for financial-health.ts — single-value financial health metrics.
 */

import { describe, expect, it } from "vitest";
import {
  emergencyFundMonths,
  savingsRate,
  debtRatio,
  concentrationRisk,
} from "@/lib/analytics/financial-health";
import type { PositionSummary } from "@/lib/schemas/portfolio";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const samplePositions: PositionSummary[] = [
  {
    symbol: "2330.TW",
    name: "TSMC",
    shares: 1000,
    avgCost: 580,
    currentPrice: 600,
    marketValue: 600_000,
    unrealizedPnl: 20_000,
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
    marketValue: 625_000,
    unrealizedPnl: 25_000,
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
    marketValue: 370_000,
    unrealizedPnl: 10_000,
    unrealizedPnlPct: 2.78,
    sector: null,
    theme: "Broad Market",
    conviction: null,
    status: "open",
  },
];

// ---------------------------------------------------------------------------
// emergencyFundMonths
// ---------------------------------------------------------------------------

describe("emergencyFundMonths", () => {
  it("computes months of runway", () => {
    // 300,000 liquid / 50,000 monthly = 6 months
    expect(emergencyFundMonths(50_000, 300_000)).toBe(6);
  });

  it("rounds to 2 decimal places", () => {
    // 300,000 / 45,000 = 6.666... → 6.67
    expect(emergencyFundMonths(45_000, 300_000)).toBe(6.67);
  });

  it("returns null for null inputs", () => {
    expect(emergencyFundMonths(null, 300_000)).toBeNull();
    expect(emergencyFundMonths(50_000, null)).toBeNull();
    expect(emergencyFundMonths(null, null)).toBeNull();
  });

  it("returns null for undefined inputs", () => {
    expect(emergencyFundMonths(undefined, 300_000)).toBeNull();
  });

  it("returns null for negative inputs", () => {
    expect(emergencyFundMonths(-1000, 300_000)).toBeNull();
    expect(emergencyFundMonths(50_000, -1000)).toBeNull();
  });

  it("returns null for NaN inputs", () => {
    expect(emergencyFundMonths(NaN, 300_000)).toBeNull();
    expect(emergencyFundMonths(50_000, NaN)).toBeNull();
  });

  it("returns Infinity when expenses are zero with positive assets", () => {
    expect(emergencyFundMonths(0, 300_000)).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns null when expenses are zero and assets are zero", () => {
    expect(emergencyFundMonths(0, 0)).toBeNull();
  });

  it("returns null when expenses are zero and assets negative", () => {
    expect(emergencyFundMonths(0, -500)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// savingsRate
// ---------------------------------------------------------------------------

describe("savingsRate", () => {
  it("computes positive savings rate", () => {
    // (100000 - 70000) / 100000 * 100 = 30%
    expect(savingsRate(100_000, 70_000)).toBe(30);
  });

  it("computes negative savings rate (overspending)", () => {
    // (50000 - 60000) / 50000 * 100 = -20%
    expect(savingsRate(50_000, 60_000)).toBe(-20);
  });

  it("returns 100% when no expenses", () => {
    expect(savingsRate(100_000, 0)).toBe(100);
  });

  it("returns null when income is zero", () => {
    expect(savingsRate(0, 10_000)).toBeNull();
  });

  it("returns null for null inputs", () => {
    expect(savingsRate(null, 10_000)).toBeNull();
    expect(savingsRate(10_000, null)).toBeNull();
  });

  it("returns null for undefined inputs", () => {
    expect(savingsRate(undefined, 10_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// debtRatio
// ---------------------------------------------------------------------------

describe("debtRatio", () => {
  it("computes debt-to-asset ratio", () => {
    // 200,000 / 1,000,000 * 100 = 20%
    expect(debtRatio(200_000, 1_000_000)).toBe(20);
  });

  it("returns 0 when no debt", () => {
    expect(debtRatio(0, 1_000_000)).toBe(0);
  });

  it("returns null when assets are zero", () => {
    expect(debtRatio(100_000, 0)).toBeNull();
  });

  it("returns null when assets are negative", () => {
    expect(debtRatio(100_000, -500)).toBeNull();
  });

  it("returns null for null inputs", () => {
    expect(debtRatio(null, 1_000_000)).toBeNull();
    expect(debtRatio(100_000, null)).toBeNull();
  });

  it("returns null for undefined inputs", () => {
    expect(debtRatio(undefined, 1_000_000)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// concentrationRisk
// ---------------------------------------------------------------------------

describe("concentrationRisk", () => {
  it("identifies the largest holding", () => {
    const result = concentrationRisk(samplePositions);
    expect(result).not.toBeNull();

    // MediaTek at 625k is the largest
    expect(result!.maxStock).toBe("2454.TW");
    expect(result!.maxName).toBe("MediaTek");
  });

  it("computes the weight as percentage", () => {
    const result = concentrationRisk(samplePositions);
    // Total: 600k + 625k + 370k = 1,595k
    // Max (MediaTek) = 625k / 1595k ≈ 39.18%
    expect(result!.maxWeight).toBeCloseTo(39.18, 1);
  });

  it("returns null for empty positions", () => {
    expect(concentrationRisk([])).toBeNull();
  });

  it("returns null when total value is zero", () => {
    const positions: PositionSummary[] = [
      {
        symbol: "ZERO.TW",
        name: "Zero",
        shares: 0,
        avgCost: 0,
        currentPrice: null,
        marketValue: 0,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        sector: null,
        theme: null,
      },
    ];
    // shares*avgCost = 0, so totalValue = 0
    expect(concentrationRisk(positions)).toBeNull();
  });

  it("single holding has 100% weight", () => {
    const positions: PositionSummary[] = [
      {
        symbol: "ONLY.TW",
        name: "Only Stock",
        shares: 100,
        avgCost: 50,
        currentPrice: null,
        marketValue: 5000,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        sector: null,
        theme: null,
      },
    ];
    const result = concentrationRisk(positions);
    expect(result).not.toBeNull();
    expect(result!.maxStock).toBe("ONLY.TW");
    expect(result!.maxWeight).toBe(100);
  });

  it("falls back to shares * avgCost when marketValue is null", () => {
    const positions: PositionSummary[] = [
      {
        symbol: "A.TW",
        name: "A",
        shares: 100,
        avgCost: 10,
        currentPrice: null,
        marketValue: 1000,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
      },
      {
        symbol: "B.TW",
        name: "B",
        shares: 50,
        avgCost: 50,
        currentPrice: null,
        marketValue: null,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
      },
    ];
    const result = concentrationRisk(positions);
    // B's fallback value = 50 * 50 = 2500 > A's 1000
    expect(result!.maxStock).toBe("B.TW");
  });
});
