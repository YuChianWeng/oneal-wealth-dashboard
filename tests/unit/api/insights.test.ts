/**
 * Tests for GET /api/insights
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListOpenPositions,
  mockListResearchSummariesForSymbols,
  mockLoadPhaseOneInsightContext,
} = vi.hoisted(() => ({
  mockListOpenPositions: vi.fn(),
  mockListResearchSummariesForSymbols: vi.fn(),
  mockLoadPhaseOneInsightContext: vi.fn(),
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

vi.mock("@/lib/data/insight-context-repository", () => ({
  loadPhaseOneInsightContext: mockLoadPhaseOneInsightContext,
}));

import { GET } from "@/app/api/insights/route";
import { ok } from "@/lib/result";
import type { PhaseOneInsightContext } from "@/lib/data/insight-context-repository";

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListResearchSummariesForSymbols.mockReturnValue(
      ok({ summaries: new Map(), invalid: [] }),
    );
    mockLoadPhaseOneInsightContext.mockReturnValue({ cashStaleAfterDays: 7 });
  });
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

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(Array.isArray(body.data)).toBe(true);
    expect(mockLoadPhaseOneInsightContext).toHaveBeenCalledOnce();
    expect(mockLoadPhaseOneInsightContext).toHaveBeenCalledWith(
      expect.any(Date),
    );
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

  it("makes Phase 1 cash freshness insights production-reachable", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));
    const phaseContext: PhaseOneInsightContext & {
      sourcePath: string;
      error: string;
    } = {
      reconciliation: {
        cashAsOfDate: "2000-01-01",
        pendingSettlements: [],
      },
      cashStaleAfterDays: 7,
      sourcePath: "/home/ubuntu/private/reconciliation.json",
      error: "secret phase context failure",
    };
    mockLoadPhaseOneInsightContext.mockReturnValue(phaseContext);

    const response = await GET();
    const body = await response.json();
    const insight = body.data.find(
      (item: { id: string }) => item.id === "insight-1.3-cash-freshness",
    );

    expect(response.status).toBe(200);
    expect(insight).toMatchObject({
      id: "insight-1.3-cash-freshness",
      insightVersion: "1.3",
      severity: "action-needed",
    });
    expect(mockLoadPhaseOneInsightContext).toHaveBeenCalledOnce();
    expect(JSON.stringify(body)).not.toContain("/home/");
    expect(JSON.stringify(body)).not.toContain("secret phase context failure");
  });

  it("joins research metadata and does not report an existing note as missing", async () => {
    mockListOpenPositions.mockReturnValue(
      ok([
        {
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
        },
      ]),
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
            },
          ],
        ]),
        invalid: [],
      }),
    );

    const response = await GET();
    expect(response.status).toBe(200);
    expect(mockListResearchSummariesForSymbols).toHaveBeenCalledWith([
      "2330.TW",
    ]);

    const body = await response.json();
    const ids = body.data.map((insight: { id: string }) => insight.id);
    expect(ids.some((id: string) => id.includes("missing-research-note"))).toBe(
      false,
    );
    expect(ids.some((id: string) => id.includes("missing-rationale"))).toBe(
      false,
    );
    expect(ids.some((id: string) => id.includes("missing-sector"))).toBe(false);
    expect(ids.some((id: string) => id.includes("missing-theme"))).toBe(false);
  });

  it("returns 200 with empty positions (may have empty-portfolio insight)", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    // There should be an "empty portfolio" insight
    const emptyInsight = body.data.find((i: { id: string }) =>
      i.id.includes("empty-portfolio"),
    );
    expect(emptyInsight).toBeTruthy();
  });

  it("has Cache-Control: private, no-store", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));

    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns a safe 500 when the research repository is unavailable", async () => {
    mockListOpenPositions.mockReturnValue(ok([]));
    mockListResearchSummariesForSymbols.mockReturnValue({
      ok: false,
      error: new Error("secret vault path /home/ubuntu/ObsidianVault"),
    });

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.error.message).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("/home/");
  });

  it("does not leak stack traces in error responses", async () => {
    // Force an error by having listOpenPositions throw
    mockListOpenPositions.mockImplementation(() => {
      throw new Error("Internal crash with secret: /home/user/data");
    });

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.error.message).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("/home/");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
