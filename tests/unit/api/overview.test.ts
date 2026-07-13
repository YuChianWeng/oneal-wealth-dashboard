/** Tests for GET /api/overview research enrichment. */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDailySnapshots,
  mockListOpenPositions,
  mockListResearchSummariesForSymbols,
  mockMonthlySummary,
} = vi.hoisted(() => ({
  mockGetDailySnapshots: vi.fn(),
  mockListOpenPositions: vi.fn(),
  mockListResearchSummariesForSymbols: vi.fn(),
  mockMonthlySummary: vi.fn(),
}));

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/portfolio-repository", () => ({
  listOpenPositions: mockListOpenPositions,
  getDailySnapshots: mockGetDailySnapshots,
}));

vi.mock("@/lib/data/research-repository", () => ({
  listResearchSummariesForSymbols: mockListResearchSummariesForSymbols,
}));

vi.mock("@/lib/data/finance-repository", () => ({
  monthlySummary: mockMonthlySummary,
}));

import { GET } from "@/app/api/overview/route";
import { err, ok } from "@/lib/result";

const position = {
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
  status: "open" as const,
  lastChecked: "2026-07-13",
};

const research = {
  symbol: "2330.TW",
  name: "台積電",
  status: "hold" as const,
  sector: "information-technology",
  theme: "ai-hpc",
  conviction: 5,
  thesis: "先進製程龍頭",
  catalysts: null,
  risks: null,
  invalidation: null,
  nextStep: null,
  sourceChecked: "2026-07-13",
  lastUpdated: "2026-07-13",
};

function request() {
  return new NextRequest("http://localhost:3000/api/overview?range=1M");
}

describe("GET /api/overview research enrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListOpenPositions.mockReturnValue(ok([position]));
    mockGetDailySnapshots.mockReturnValue(ok([]));
    mockMonthlySummary.mockReturnValue(err(new Error("optional fixture absent")));
    mockListResearchSummariesForSymbols.mockReturnValue(
      ok({ summaries: new Map([["2330.TW", research]]), invalid: [] }),
    );
  });

  it("uses the same research-enriched insight view as /api/insights", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mockListResearchSummariesForSymbols).toHaveBeenCalledWith(["2330.TW"]);

    const body = await response.json();
    expect(body.version).toBe(1);
    const ids = body.data.insights.map((item: { id: string }) => item.id);
    expect(ids.some((id: string) => id.includes("missing-research-note"))).toBe(false);
    expect(ids.some((id: string) => id.includes("missing-rationale"))).toBe(false);
    expect(ids.some((id: string) => id.includes("missing-sector"))).toBe(false);
    expect(ids.some((id: string) => id.includes("missing-theme"))).toBe(false);
  });

  it("fails closed when the research scan is unavailable", async () => {
    mockListResearchSummariesForSymbols.mockReturnValue(
      err(new Error("secret vault path /home/ubuntu/ObsidianVault")),
    );

    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.error.message).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("/home/");
  });
});
