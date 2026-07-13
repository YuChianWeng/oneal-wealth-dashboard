import { describe, expect, it } from "vitest";
import { buildPortfolioResearchView } from "@/lib/data/portfolio-research-view";
import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { ResearchSummary } from "@/lib/schemas/research";

function position(overrides: Partial<PositionSummary> = {}): PositionSummary {
  return {
    symbol: "2330.TW",
    name: "台積電",
    shares: 10,
    avgCost: 900,
    currentPrice: 1000,
    marketValue: 10000,
    unrealizedPnl: 1000,
    unrealizedPnlPct: 11.11,
    sector: null,
    theme: null,
    conviction: null,
    status: "open",
    lastChecked: "2026-07-10",
    ...overrides,
  };
}

function research(overrides: Partial<ResearchSummary> = {}): ResearchSummary {
  return {
    symbol: "2330.TW",
    name: "台積電",
    status: "hold",
    sector: "半導體",
    theme: "AI / HPC",
    conviction: 5,
    thesis: "先進製程龍頭",
    catalysts: null,
    risks: null,
    invalidation: null,
    nextStep: null,
    sourceChecked: "2026-07-10",
    lastUpdated: "2026-07-10",
    ...overrides,
  };
}

describe("buildPortfolioResearchView", () => {
  it("enriches position metadata from matching research", () => {
    const summary = research();
    const original = position({
      sector: "Legacy Sector",
      theme: "Legacy Theme",
      conviction: 1,
    });
    const result = buildPortfolioResearchView([original], {
      summaries: new Map([["2330.TW", summary]]),
      invalid: [],
    });

    expect(result.positions[0]).toMatchObject({
      symbol: "2330.TW",
      sector: "半導體",
      theme: "AI / HPC",
      conviction: 5,
    });
    expect(original).toMatchObject({
      sector: "Legacy Sector",
      theme: "Legacy Theme",
      conviction: 1,
    });
    expect(result.researchSummaries).toEqual([summary]);
    expect(result.invalidResearchSymbols).toEqual([]);
  });

  it("normalizes case when joining symbols", () => {
    const result = buildPortfolioResearchView(
      [position({ symbol: "2330.tw" })],
      {
        summaries: new Map([["2330.TW", research()]]),
        invalid: [],
      },
    );

    expect(result.positions[0].sector).toBe("半導體");
  });

  it("preserves legacy position metadata when no research exists", () => {
    const result = buildPortfolioResearchView(
      [
        position({
          symbol: "9999.TW",
          sector: "Legacy Sector",
          theme: "Legacy Theme",
          conviction: 2,
        }),
      ],
      { summaries: new Map(), invalid: [] },
    );

    expect(result.positions[0]).toMatchObject({
      sector: "Legacy Sector",
      theme: "Legacy Theme",
      conviction: 2,
    });
    expect(result.researchSummaries).toEqual([]);
  });

  it("passes invalid research symbols without treating them as summaries", () => {
    const result = buildPortfolioResearchView([position()], {
      summaries: new Map(),
      invalid: [{ symbol: "2330.TW", code: "VAULT_INVALID_RESEARCH" }],
    });

    expect(result.researchSummaries).toEqual([]);
    expect(result.invalidResearchSymbols).toEqual(["2330.TW"]);
  });
});
