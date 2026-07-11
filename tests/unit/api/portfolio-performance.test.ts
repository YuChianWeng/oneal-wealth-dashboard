/**
 * Tests for GET /api/portfolio/performance
 */

import { describe, expect, it, vi } from "vitest";

const { mockGetDailySnapshots } = vi.hoisted(() => ({
  mockGetDailySnapshots: vi.fn(),
}));

import { NextRequest } from "next/server";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/portfolio-repository", () => ({
  getDailySnapshots: mockGetDailySnapshots,
  listOpenPositions: vi.fn(),
}));

import { GET } from "@/app/api/portfolio/performance/route";
import { ok, err } from "@/lib/result";
import { SourceError } from "@/lib/errors";

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/portfolio/performance", () => {
  const sampleSnapshots = [
    { date: "2026-06-30", totalValue: 800000 },
    { date: "2026-07-01", totalValue: 810000 },
    { date: "2026-07-07", totalValue: 820000 },
  ];

  it("returns 200 with performance chart data", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance?range=1Y"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.dates).toHaveLength(3);
    expect(body.data.portfolioIndex).toHaveLength(3);
    expect(body.data.portfolioIndex[0]).toBe(100); // base
    expect(body.data.rawMarketValue).toEqual([800000, 810000, 820000]);
  });

  it("returns 200 with empty arrays for no snapshots", async () => {
    mockGetDailySnapshots.mockReturnValue(ok([]));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.dates).toEqual([]);
    expect(body.data.portfolioIndex).toEqual([]);
  });

  it("returns 400 for invalid range", async () => {
    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance?range=INVALID"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 200 with default range (1Y) when not specified", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.status).toBe(200);
  });

  it("handles repository errors gracefully", async () => {
    mockGetDailySnapshots.mockReturnValue(
      err(new SourceError("Vault error", "SOURCE_ERROR")),
    );

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.status).toBe(200); // Returns empty data on error
  });

  it("has Cache-Control: private, no-store", async () => {
    mockGetDailySnapshots.mockReturnValue(ok(sampleSnapshots));

    const response = await GET(
      req("http://localhost:3000/api/portfolio/performance"),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
