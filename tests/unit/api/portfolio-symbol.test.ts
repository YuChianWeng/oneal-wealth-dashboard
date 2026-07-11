/**
 * Tests for GET /api/portfolio/[symbol]
 */

import { describe, expect, it, vi } from "vitest";

const { mockGetPosition, mockGetTrades, mockGetResearchSummary } = vi.hoisted(() => ({
  mockGetPosition: vi.fn(),
  mockGetTrades: vi.fn(),
  mockGetResearchSummary: vi.fn(),
}));

import { NextRequest } from "next/server";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));


vi.mock("@/lib/data/portfolio-repository", () => ({
  getPosition: mockGetPosition,
  getTrades: mockGetTrades,
  listOpenPositions: vi.fn(),
  getDailySnapshots: vi.fn(),
}));

vi.mock("@/lib/data/research-repository", () => ({
  getResearchSummary: mockGetResearchSummary,
}));

import { GET } from "@/app/api/portfolio/[symbol]/route";
import { ok, err } from "@/lib/result";
import { SourceError, NotFoundError } from "@/lib/errors";

function req(): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/portfolio/2330.TW"));
}

describe("GET /api/portfolio/[symbol]", () => {
  const samplePosition = {
    symbol: "2330.TW",
    name: "台積電",
    shares: 1000,
    avgCost: 580,
    currentPrice: 600,
    marketValue: 600000,
    unrealizedPnl: 20000,
    unrealizedPnlPct: 3.45,
  };

  const sampleTrade = {
    id: "txn-1",
    date: "2026-07-01",
    symbol: "2330.TW",
    name: "台積電",
    side: "buy" as const,
    shares: 500,
    price: 570,
  };

  const sampleResearch = {
    symbol: "2330.TW",
    name: "台積電",
    status: "hold",
    thesis: "Leading foundry",
    conviction: 5,
  };

  it("returns 200 with position, trades, and research", async () => {
    mockGetPosition.mockReturnValue(ok(samplePosition));
    mockGetTrades.mockReturnValue(ok([sampleTrade]));
    mockGetResearchSummary.mockReturnValue(ok(sampleResearch));

    const response = await GET(req(), {
      params: Promise.resolve({ symbol: "2330.TW" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.position.symbol).toBe("2330.TW");
    expect(body.data.trades).toHaveLength(1);
    expect(body.data.research.symbol).toBe("2330.TW");
  });

  it("returns 400 for invalid symbol (special chars)", async () => {
    const response = await GET(req(), {
      params: Promise.resolve({ symbol: "../../etc/passwd" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 for empty symbol", async () => {
    const response = await GET(req(), {
      params: Promise.resolve({ symbol: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 404 when position not found", async () => {
    mockGetPosition.mockReturnValue(
      err(new SourceError("Not found", "VAULT_POSITION_NOT_FOUND")),
    );

    const response = await GET(req(), {
      params: Promise.resolve({ symbol: "9999.TW" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 200 with null research when research unavailable", async () => {
    mockGetPosition.mockReturnValue(ok(samplePosition));
    mockGetTrades.mockReturnValue(ok([]));
    mockGetResearchSummary.mockReturnValue(
      err(new NotFoundError("Not found", "VAULT_RESEARCH_NOT_FOUND")),
    );

    const response = await GET(req(), {
      params: Promise.resolve({ symbol: "2330.TW" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.position).toBeTruthy();
    expect(body.data.research).toBeNull();
  });

  it("has Cache-Control: private, no-store", async () => {
    mockGetPosition.mockReturnValue(ok(samplePosition));
    mockGetTrades.mockReturnValue(ok([]));
    mockGetResearchSummary.mockReturnValue(ok(sampleResearch));

    const response = await GET(req(), {
      params: Promise.resolve({ symbol: "2330.TW" }),
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
