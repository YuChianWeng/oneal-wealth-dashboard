/**
 * Tests for GET /api/finance/transactions
 */

import { describe, expect, it, vi } from "vitest";

const { mockTransactionsPage } = vi.hoisted(() => ({
  mockTransactionsPage: vi.fn(),
}));

import { NextRequest } from "next/server";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

vi.mock("@/lib/data/finance-repository", () => ({
  transactionsPage: mockTransactionsPage,
}));

import { GET } from "@/app/api/finance/transactions/route";
import { ok, err } from "@/lib/result";
import { SourceError } from "@/lib/errors";

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/finance/transactions", () => {
  const sampleRows = [
    {
      id: 1,
      date: "2026-06-15",
      item: "Groceries",
      amount: 2500,
      account: "Checking",
      category: "Food",
      type: "expense" as const,
      currency: "TWD",
    },
    {
      id: 2,
      date: "2026-06-16",
      item: "Salary",
      amount: 50000,
      account: "Checking",
      category: "Salary",
      type: "income" as const,
      currency: "TWD",
    },
  ];

  it("returns 200 with paginated transactions", async () => {
    mockTransactionsPage.mockReturnValue(
      ok({ rows: sampleRows, total: 2, page: 1, pageSize: 20 }),
    );

    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.total).toBe(2);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(20);
  });

  it("returns 400 for invalid month", async () => {
    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=bad"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid page (negative)", async () => {
    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06&page=-1"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid pageSize (>100)", async () => {
    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06&pageSize=200"),
    );
    expect(response.status).toBe(400);
  });

  it("accepts optional category filter", async () => {
    mockTransactionsPage.mockReturnValue(
      ok({ rows: sampleRows, total: 2, page: 1, pageSize: 20 }),
    );

    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06&category=Food"),
    );
    expect(response.status).toBe(200);
  });

  it("accepts optional account filter", async () => {
    mockTransactionsPage.mockReturnValue(
      ok({ rows: sampleRows, total: 2, page: 1, pageSize: 20 }),
    );

    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06&account=Checking"),
    );
    expect(response.status).toBe(200);
  });

  it("returns 500 on repository error", async () => {
    mockTransactionsPage.mockReturnValue(
      err(new SourceError("DB error", "SOURCE_DB_ERROR")),
    );

    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06"),
    );
    expect(response.status).toBe(500);
  });

  it("has Cache-Control: private, no-store", async () => {
    mockTransactionsPage.mockReturnValue(
      ok({ rows: [], total: 0, page: 1, pageSize: 20 }),
    );

    const response = await GET(
      req("http://localhost:3000/api/finance/transactions?month=2026-06"),
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
