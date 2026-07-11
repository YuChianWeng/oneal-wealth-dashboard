/**
 * Tests for GET /api/insights
 */

import { describe, expect, it, vi } from "vitest";

const { mockListOpenPositions, mockMonthlySummary } = vi.hoisted(() => ({
  mockListOpenPositions: vi.fn(),
  mockMonthlySummary: vi.fn(),
}));


vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));


vi.mock("@/lib/data/portfolio-repository", () => ({
  listOpenPositions: mockListOpenPositions,
  getDailySnapshots: vi.fn(),
}));

vi.mock("@/lib/data/finance-repository", () => ({
  monthlySummary: mockMonthlySummary,
}));

import { GET } from "@/app/api/insights/route";
import { ok } from "@/lib/result";

describe("GET /api/insights", () => {
  it("returns 200 with insights array", async () => {
    mockListOpenPositions.mockReturnValue(
      ok([
        {
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
        },
      ]),
    );
    mockMonthlySummary.mockReturnValue(
      ok({
        month: "2026-07",
        totalIncome: 50000,
        totalExpense: 30000,
        netCashflow: 20000,
        categoryBreakdown: [],
        accountBreakdown: [],
      }),
    );

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    // Each insight should have required fields
    for (const insight of body.data) {
      expect(insight.id).toBeTruthy();
      expect(insight.severity).toBeTruthy();
      expect(insight.title).toBeTruthy();
      expect(insight.description).toBeTruthy();
      expect(insight.drillThroughUrl).toBeTruthy();
      expect(insight.generatedAt).toBeTruthy();
    }
  });

  it("returns 200 with empty positions (may have empty-portfolio insight)", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));
    mockMonthlySummary.mockReturnValue(
      ok({
        month: "2026-07",
        totalIncome: 0,
        totalExpense: 0,
        netCashflow: 0,
        categoryBreakdown: [],
        accountBreakdown: [],
      }),
    );

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    // There should be an "empty portfolio" insight
    const emptyInsight = body.data.find(
      (i: { id: string }) => i.id.includes("empty-portfolio"),
    );
    expect(emptyInsight).toBeTruthy();
  });

  it("has Cache-Control: private, no-store", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));
    mockMonthlySummary.mockReturnValue(
      ok({
        month: "2026-07",
        totalIncome: 0,
        totalExpense: 0,
        netCashflow: 0,
        categoryBreakdown: [],
        accountBreakdown: [],
      }),
    );

    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not leak stack traces in error responses", async () => {
    // Force an error by having listOpenPositions throw
    mockListOpenPositions.mockImplementation(() => {
      throw new Error("Internal crash with secret: /home/user/data");
    });
    mockMonthlySummary.mockReturnValue(ok(null));

    const response = await GET();
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error.message).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("/home/");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
