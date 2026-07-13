/**
 * Tests for GET /api/portfolio
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListOpenPositions,
  mockListResearchSummariesForSymbols,
  mockLoadStockTaxonomyLabels,
} = vi.hoisted(() => ({
  mockListOpenPositions: vi.fn(),
  mockListResearchSummariesForSymbols: vi.fn(),
  mockLoadStockTaxonomyLabels: vi.fn(),
}));

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/portfolio-repository", () => ({
  listOpenPositions: mockListOpenPositions,
  getDailySnapshots: vi.fn(),
}));

vi.mock("@/lib/data/research-repository", () => ({
  listResearchSummariesForSymbols: mockListResearchSummariesForSymbols,
}));

vi.mock("@/lib/data/stock-taxonomy-repository", () => ({
  loadStockTaxonomyLabels: mockLoadStockTaxonomyLabels,
}));

import { GET } from "@/app/api/portfolio/route";
import { ok, err } from "@/lib/result";
import { SourceError } from "@/lib/errors";

const samplePosition = {
  symbol: "2330.TW",
  name: "台積電",
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
};

describe("GET /api/portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListResearchSummariesForSymbols.mockReturnValue(
      ok({ summaries: new Map(), invalid: [] }),
    );
    mockLoadStockTaxonomyLabels.mockReturnValue(ok(new Map()));
  });

  it("returns 200 with positions and allocation", async () => {
    mockListOpenPositions.mockReturnValue(ok([samplePosition]));

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.positions).toHaveLength(1);
    expect(body.data.positions[0].symbol).toBe("2330.TW");
    // allocation from portfolio-calculations uses "category" field
    expect(body.data.allocation.byStock).toHaveLength(1);
    expect(body.data.allocation.byStock[0].category).toContain("2330.TW");
    expect(body.data.summary.totalMarketValue).toBe(600000);
    expect(body.data.summary.positionCount).toBe(1);
  });

  it("enriches canonical taxonomy and returns display-labelled allocation", async () => {
    mockListOpenPositions.mockReturnValue(
      ok([{ ...samplePosition, sector: null, theme: null, conviction: null }]),
    );
    mockListResearchSummariesForSymbols.mockReturnValue(
      ok({
        summaries: new Map([
          [
            "2330.TW",
            {
              symbol: "2330.TW",
              name: "台積電",
              status: "hold",
              classificationVersion: 1,
              classificationStatus: "classified",
              assetClass: "equity",
              market: "TW",
              sector: "information-technology",
              industry: "semiconductors",
              subindustry: "foundry",
              portfolioRole: "core",
              themes: ["ai-hpc", "taiwan-large-cap"],
              theme: "ai-hpc",
              conviction: 5,
              thesis: null,
              catalysts: null,
              risks: null,
              invalidation: null,
              nextStep: null,
              sourceChecked: "2026-07-13",
              lastUpdated: "2026-07-13",
            },
          ],
        ]),
        invalid: [],
      }),
    );
    mockLoadStockTaxonomyLabels.mockReturnValue(
      ok(
        new Map([
          ["information-technology", "資訊科技"],
          ["semiconductors", "半導體"],
          ["core", "核心配置"],
          ["ai-hpc", "AI／HPC"],
          ["taiwan-large-cap", "台灣大型權值股"],
        ]),
      ),
    );

    const response = await GET();
    const body = await response.json();
    expect(body.data.positions[0].themes).toEqual([
      "ai-hpc",
      "taiwan-large-cap",
    ]);
    expect(body.data.allocation.bySector[0]).toMatchObject({
      categoryId: "information-technology",
      category: "資訊科技",
    });
    expect(body.data.allocation.byIndustry[0].category).toBe("半導體");
    expect(body.data.allocation.byPortfolioRole[0].category).toBe("核心配置");
    expect(body.data.allocation.byTheme).toHaveLength(2);
  });

  it("returns 200 with empty positions array", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.positions).toEqual([]);
    expect(body.data.summary.positionCount).toBe(0);
    expect(body.data.summary.totalMarketValue).toBe(0);
  });

  it("returns 500 on repository error", async () => {
    mockListOpenPositions.mockReturnValue(
      err(new SourceError("Vault unavailable", "SOURCE_ERROR")),
    );

    const response = await GET();
    expect(response.status).toBe(500);
  });

  it("has Cache-Control: private, no-store", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("summary stats compute correctly", async () => {
    const pos1 = { ...samplePosition };
    const pos2 = {
      ...samplePosition,
      symbol: "2454.TW",
      name: "聯發科",
      shares: 200,
      avgCost: 1200,
      marketValue: 250000,
      unrealizedPnl: 10000,
    };
    mockListOpenPositions.mockReturnValue(ok([pos1, pos2]));

    const response = await GET();
    const body = await response.json();
    expect(body.data.summary.totalMarketValue).toBe(850000);
    expect(body.data.summary.totalCost).toBe(1000 * 580 + 200 * 1200);
    expect(body.data.summary.positionCount).toBe(2);
  });
});
