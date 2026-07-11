/**
 * Tests for GET /api/finance/summary
 */

import { describe, expect, it, vi } from "vitest";

const { mockMonthlySummary } = vi.hoisted(() => ({
  mockMonthlySummary: vi.fn(),
}));

import { NextRequest } from "next/server";

// Mock server-only
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

// Mock finance-repository
vi.mock("@/lib/data/finance-repository", () => ({
  monthlySummary: mockMonthlySummary,
}));

import { GET } from "@/app/api/finance/summary/route";
import { ok, err } from "@/lib/result";
import { SourceError } from "@/lib/errors";

function buildRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/finance/summary", () => {
  it("returns 200 with monthly summary for valid month", async () => {
    mockMonthlySummary.mockReturnValue(
      ok({
        month: "2026-06",
        totalIncome: 55000,
        totalExpense: 35000,
        netCashflow: 20000,
        categoryBreakdown: [{ category: "Food", amount: 8000 }],
        accountBreakdown: [{ account: "Checking", amount: 35000 }],
      }),
    );

    const req = buildRequest("http://localhost:3000/api/finance/summary?month=2026-06");
    const response = await GET(req);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.month).toBe("2026-06");
    expect(body.data.totalIncome).toBe(55000);
    expect(body.data.netCashflow).toBe(20000);
  });

  it("returns 400 for invalid month format", async () => {
    const req = buildRequest(
      "http://localhost:3000/api/finance/summary?month=not-a-month",
    );
    const response = await GET(req);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for missing month param", async () => {
    const req = buildRequest("http://localhost:3000/api/finance/summary");
    const response = await GET(req);
    expect(response.status).toBe(400);
  });

  it("returns 404 when data not found", async () => {
    mockMonthlySummary.mockReturnValue(
      err(new SourceError("No data found", "SOURCE_NOT_FOUND")),
    );

    const req = buildRequest(
      "http://localhost:3000/api/finance/summary?month=2020-01",
    );
    const response = await GET(req);
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("SOURCE_NOT_FOUND");
  });

  it("returns 500 for unexpected errors", async () => {
    mockMonthlySummary.mockReturnValue(
      err(new SourceError("DB error", "SOURCE_DB_ERROR")),
    );

    const req = buildRequest(
      "http://localhost:3000/api/finance/summary?month=2026-06",
    );
    const response = await GET(req);
    expect(response.status).toBe(500);
  });

  it("includes Cache-Control: private, no-store", async () => {
    mockMonthlySummary.mockReturnValue(
      ok({
        month: "2026-06",
        totalIncome: 1000,
        totalExpense: 500,
        netCashflow: 500,
        categoryBreakdown: [],
        accountBreakdown: [],
      }),
    );

    const req = buildRequest("http://localhost:3000/api/finance/summary?month=2026-06");
    const response = await GET(req);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not leak internal state in error responses", async () => {
    mockMonthlySummary.mockReturnValue(
      err(new SourceError("Safe message", "SOURCE_ERROR")),
    );

    const req = buildRequest(
      "http://localhost:3000/api/finance/summary?month=2026-06",
    );
    const response = await GET(req);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("/home/");
  });
});
