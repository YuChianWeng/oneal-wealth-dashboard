/**
 * Tests for allocation.ts — stock, sector, and theme allocation analysis.
 */

import { describe, expect, it } from "vitest";
import {
  computeAllocationByStock,
  computeAllocationBySector,
  computeAllocationByTheme,
  computeAllocationBreakdown,
} from "@/lib/analytics/allocation";
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
  {
    symbol: "2881.TW",
    name: "Fubon Financial",
    shares: 5000,
    avgCost: 90,
    currentPrice: 92,
    marketValue: 460_000,
    unrealizedPnl: 10_000,
    unrealizedPnlPct: 2.22,
    sector: "Financials",
    theme: null,
    conviction: null,
    status: "open",
  },
];

// ---------------------------------------------------------------------------
// computeAllocationByStock
// ---------------------------------------------------------------------------

describe("computeAllocationByStock", () => {
  it("returns one bucket per position", () => {
    const result = computeAllocationByStock(samplePositions);
    expect(result).toHaveLength(4);
  });

  it("sorts by value descending", () => {
    const result = computeAllocationByStock(samplePositions);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeLessThanOrEqual(result[i - 1].value);
    }
  });

  it("includes symbol in label", () => {
    const result = computeAllocationByStock(samplePositions);
    const labels = result.map((b) => b.label);
    expect(labels).toContain("2330.TW — TSMC");
    expect(labels).toContain("2454.TW — MediaTek");
  });

  it("percentages sum to approximately 100", () => {
    const result = computeAllocationByStock(samplePositions);
    const total = result.reduce((s, b) => s + b.percentage, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("returns empty array for empty positions", () => {
    expect(computeAllocationByStock([])).toEqual([]);
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
        sector: null,
        theme: null,
      },
    ];
    const result = computeAllocationByStock(positions);
    expect(result[0].value).toBe(5000);
    expect(result[0].percentage).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeAllocationBySector
// ---------------------------------------------------------------------------

describe("computeAllocationBySector", () => {
  it("groups by sector", () => {
    const result = computeAllocationBySector(samplePositions);

    // Semiconductors: 2330 (600k) + 2454 (625k) = 1225k
    const semi = result.find((b) => b.label === "Semiconductors");
    expect(semi).toBeDefined();
    expect(semi!.value).toBe(1_225_000);

    // Financials: 460k
    const fin = result.find((b) => b.label === "Financials");
    expect(fin).toBeDefined();
    expect(fin!.value).toBe(460_000);
  });

  it("flags unclassified holdings explicitly", () => {
    const result = computeAllocationBySector(samplePositions);

    // 0050.TW has no sector → should appear as "unclassified"
    const unc = result.find((b) => b.label === "unclassified");
    expect(unc).toBeDefined();
    expect(unc!.value).toBe(370_000);
  });

  it("sorts by value descending", () => {
    const result = computeAllocationBySector(samplePositions);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeLessThanOrEqual(result[i - 1].value);
    }
  });

  it("percentages sum to approximately 100", () => {
    const result = computeAllocationBySector(samplePositions);
    const total = result.reduce((s, b) => s + b.percentage, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("returns empty for empty positions", () => {
    expect(computeAllocationBySector([])).toEqual([]);
  });

  it("all unclassified when no sectors defined", () => {
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
        sector: null,
        theme: null,
      },
      {
        symbol: "B.TW",
        name: "B",
        shares: 200,
        avgCost: 5,
        currentPrice: null,
        marketValue: 1000,
        unrealizedPnl: null,
        unrealizedPnlPct: null,
        sector: null,
        theme: null,
      },
    ];
    const result = computeAllocationBySector(positions);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("unclassified");
    expect(result[0].percentage).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// computeAllocationByTheme
// ---------------------------------------------------------------------------

describe("computeAllocationByTheme", () => {
  it("groups by theme", () => {
    const result = computeAllocationByTheme(samplePositions);

    // AI / HPC: 2330 (600k)
    const aiHpc = result.find((b) => b.label === "AI / HPC");
    expect(aiHpc).toBeDefined();
    expect(aiHpc!.value).toBe(600_000);

    // Broad Market: 0050 (370k)
    const broad = result.find((b) => b.label === "Broad Market");
    expect(broad).toBeDefined();
    expect(broad!.value).toBe(370_000);
  });

  it("flags unclassified themes explicitly", () => {
    const result = computeAllocationByTheme(samplePositions);

    // 2881.TW has no theme → "unclassified"
    const unc = result.find((b) => b.label === "unclassified");
    expect(unc).toBeDefined();
    expect(unc!.value).toBe(460_000);
  });

  it("sorts by value descending", () => {
    const result = computeAllocationByTheme(samplePositions);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeLessThanOrEqual(result[i - 1].value);
    }
  });

  it("percentages sum to approximately 100", () => {
    const result = computeAllocationByTheme(samplePositions);
    const total = result.reduce((s, b) => s + b.percentage, 0);
    expect(total).toBeCloseTo(100, 1);
  });

  it("returns empty for empty positions", () => {
    expect(computeAllocationByTheme([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeAllocationBreakdown
// ---------------------------------------------------------------------------

describe("computeAllocationBreakdown", () => {
  it("returns all three dimensions", () => {
    const result = computeAllocationBreakdown(samplePositions);
    expect(result.byStock).toHaveLength(4);
    expect(result.bySector.length).toBeGreaterThan(0);
    expect(result.byTheme.length).toBeGreaterThan(0);
  });
});
