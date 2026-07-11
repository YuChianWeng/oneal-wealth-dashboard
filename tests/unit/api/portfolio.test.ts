/**
 * Tests for GET /api/portfolio
 */

import { describe, expect, it, vi } from "vitest";

const { mockListOpenPositions } = vi.hoisted(() => ({
  mockListOpenPositions: vi.fn(),
}));


vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/portfolio-repository", () => ({
  listOpenPositions: mockListOpenPositions,
  getDailySnapshots: vi.fn(),
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
