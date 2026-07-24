/**
 * Tests for insights.ts — deterministic insight generator.
 */

import { describe, expect, it } from "vitest";
import { generateInsights, INSIGHT_VERSION } from "@/lib/analytics/insights";
import type { InsightContext } from "@/lib/analytics/insights";
import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { ResearchSummary } from "@/lib/schemas/research";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fixed "now" for deterministic tests. */
const NOW = "2026-07-10T12:00:00.000Z";

function makePosition(
  overrides: Partial<PositionSummary> = {},
): PositionSummary {
  return {
    symbol: "2330.TW",
    name: "TSMC",
    shares: 1000,
    avgCost: 580,
    currentPrice: 600,
    marketValue: 600_000,
    unrealizedPnl: 20_000,
    unrealizedPnlPct: 3.45,
    sector: "Semiconductors",
    theme: "AI / HPC",
    conviction: 5,
    status: "open",
    lastChecked: "2026-07-10",
    ...overrides,
  };
}

function makeResearch(
  overrides: Partial<ResearchSummary> = {},
): ResearchSummary {
  return {
    symbol: "2330.TW",
    name: "TSMC",
    status: "hold",
    sector: "Semiconductors",
    theme: "AI / HPC",
    conviction: 5,
    thesis: "Leading foundry",
    catalysts: "N3 ramp",
    risks: "Geopolitics",
    invalidation: "Market share < 50%",
    nextStep: "Monitor earnings",
    lastUpdated: "2026-07-05",
    sourceChecked: "2026-07-05",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("produces the same insights for the same input", () => {
    const ctx: InsightContext = {
      positions: [makePosition()],
      now: NOW,
    };
    const a = generateInsights(ctx);
    const b = generateInsights(ctx);
    expect(a).toEqual(b);
  });

  it("produces stable IDs", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ conviction: null })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    for (const insight of result) {
      expect(insight.id).toMatch(/^insight-/);
      expect(insight.insightVersion).toBe(INSIGHT_VERSION);
    }
  });

  it("all insights have required fields", () => {
    const ctx: InsightContext = {
      positions: [
        makePosition({
          lastChecked: "2026-06-01",
          conviction: null,
          sector: null,
        }),
      ],
      now: NOW,
    };
    const result = generateInsights(ctx);
    expect(result.length).toBeGreaterThan(0);

    for (const insight of result) {
      expect(insight.id).toBeTruthy();
      expect(insight.insightVersion).toBeTruthy();
      expect(["action-needed", "notice", "info"]).toContain(insight.severity);
      expect(insight.title).toBeTruthy();
      expect(insight.description).toBeTruthy();
      expect(insight.drillThroughUrl).toBeTruthy();
      expect(insight.generatedAt).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Rule: Stale prices
// ---------------------------------------------------------------------------

describe("stale prices", () => {
  it("flags positions with stale lastChecked", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ lastChecked: "2026-07-01" })], // 9 days ago
      now: NOW,
    };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-prices"));
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe("action-needed");
    expect(stale!.title).toContain("stale prices");
  });

  it("accepts Friday prices through Monday before the update window", () => {
    const result = generateInsights({
      positions: [makePosition({ lastChecked: "2026-07-10" })],
      now: "2026-07-13T09:00:00+08:00",
    });
    expect(result.find((i) => i.id.includes("stale-prices"))).toBeUndefined();
  });

  it("requires Monday prices after the update window", () => {
    const result = generateInsights({
      positions: [makePosition({ lastChecked: "2026-07-10" })],
      now: "2026-07-13T15:00:00+08:00",
    });
    expect(result.find((i) => i.id.includes("stale-prices"))).toBeDefined();
  });

  it("accepts the last session across a verified TWSE long holiday", () => {
    const result = generateInsights({
      positions: [makePosition({ lastChecked: "2026-04-02" })],
      now: "2026-04-07T09:00:00+08:00",
    });
    expect(result.find((i) => i.id.includes("stale-prices"))).toBeUndefined();
  });

  it("does not guess when the annual TWSE holiday calendar is absent", () => {
    const result = generateInsights({
      positions: [makePosition({ lastChecked: "2026-01-01" })],
      now: "2027-01-04T15:00:00+08:00",
    });
    expect(result.find((i) => i.id.includes("stale-prices"))).toBeUndefined();
  });

  it("still flags a missing lastChecked outside calendar coverage", () => {
    const result = generateInsights({
      positions: [makePosition({ lastChecked: undefined })],
      now: "2027-01-04T15:00:00+08:00",
    });
    const stale = result.find((i) => i.id.includes("stale-prices"));
    expect(stale).toBeDefined();
    expect(stale?.description).toContain("missing a last-checked date");
  });

  it("fails safely for invalid or offsetless now values", () => {
    for (const now of ["not-a-date", "2026-07-13T15:00:00"]) {
      const result = generateInsights({
        positions: [makePosition({ lastChecked: "2026-07-10" })],
        now,
      });
      expect(result.find((i) => i.id.includes("stale-prices"))).toBeUndefined();
      expect(
        result.every((insight) =>
          /^\d{4}-\d{2}-\d{2}$/.test(insight.generatedAt),
        ),
      ).toBe(true);
    }
  });

  it("flags positions with no lastChecked", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ lastChecked: undefined })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-prices"));
    expect(stale).toBeDefined();
  });

  it("does NOT flag fresh prices", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ lastChecked: "2026-07-10" })], // same day
      now: NOW,
    };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-prices"));
    expect(stale).toBeUndefined();
  });

  it("does NOT flag when no positions", () => {
    const result = generateInsights({ positions: [], now: NOW });
    const stale = result.find((i) => i.id.includes("stale-prices"));
    expect(stale).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: Missing trade rationale
// ---------------------------------------------------------------------------

describe("missing trade rationale", () => {
  it("flags positions without conviction", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ conviction: null })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const rationale = result.find((i) => i.id.includes("missing-rationale"));
    expect(rationale).toBeDefined();
    expect(rationale!.severity).toBe("notice");
  });

  it("does NOT flag when all positions have conviction", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ conviction: 4 })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const rationale = result.find((i) => i.id.includes("missing-rationale"));
    expect(rationale).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: High concentration
// ---------------------------------------------------------------------------

describe("high concentration", () => {
  it("flags when a single stock exceeds 30%", () => {
    // One stock = 100% concentration
    const ctx: InsightContext = {
      positions: [makePosition()],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const conc = result.find((i) => i.id.includes("high-concentration"));
    expect(conc).toBeDefined();
  });

  it("elevates severity above 50%", () => {
    const ctx: InsightContext = {
      positions: [makePosition()], // 100%
      now: NOW,
    };
    const result = generateInsights(ctx);
    const conc = result.find((i) => i.id.includes("high-concentration"));
    expect(conc).toBeDefined();
    expect(conc!.severity).toBe("action-needed");
  });

  it("uses notice severity for 30–50%", () => {
    // Three positions: 600k + 500k + 400k = 1500k, max = 600k/1500k = 40% (notice)
    const ctx: InsightContext = {
      positions: [
        makePosition(), // 600k
        makePosition({
          symbol: "2454.TW",
          name: "MediaTek",
          marketValue: 500_000,
        }),
        makePosition({
          symbol: "2881.TW",
          name: "Fubon",
          marketValue: 400_000,
        }),
      ],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const conc = result.find((i) => i.id.includes("high-concentration"));
    expect(conc).toBeDefined();
    expect(conc!.severity).toBe("notice");
  });

  it("does NOT flag diverse portfolios", () => {
    // 4 equal positions at 25% each (below 30% threshold)
    const positions: PositionSummary[] = [2330, 2454, 2881, 3711].map(
      (code, i) =>
        makePosition({
          symbol: `${code}.TW`,
          name: `Stock ${i}`,
          marketValue: 250_000,
        }),
    );
    const ctx: InsightContext = { positions, now: NOW };
    const result = generateInsights(ctx);
    const conc = result.find((i) => i.id.includes("high-concentration"));
    expect(conc).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: Stale research
// ---------------------------------------------------------------------------

describe("stale research", () => {
  it("flags research older than 30 days", () => {
    const ctx: InsightContext = {
      researchSummaries: [makeResearch({ lastUpdated: "2026-01-01" })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-research"));
    expect(stale).toBeDefined();
  });

  it("keeps exactly 30 calendar days fresh regardless of timestamp time", () => {
    const result = generateInsights({
      researchSummaries: [makeResearch({ lastUpdated: "2026-06-10" })],
      now: "2026-07-10T12:00:00Z",
    });
    expect(result.find((i) => i.id.includes("stale-research"))).toBeUndefined();
    expect(
      result.every((insight) => insight.generatedAt === "2026-07-10"),
    ).toBe(true);
  });

  it("flags research with no lastUpdated", () => {
    const ctx: InsightContext = {
      researchSummaries: [
        makeResearch({ lastUpdated: undefined, sourceChecked: undefined }),
      ],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-research"));
    expect(stale).toBeDefined();
  });

  it("does NOT flag fresh research", () => {
    const ctx: InsightContext = {
      researchSummaries: [makeResearch({ lastUpdated: "2026-07-05" })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-research"));
    expect(stale).toBeUndefined();
  });

  it("elevates severity when many stale", () => {
    const manyStale: ResearchSummary[] = [2330, 2454, 2881, 3711, 6505].map(
      (code) =>
        makeResearch({
          symbol: `${code}.TW`,
          lastUpdated: "2026-01-01",
        }),
    );
    const ctx: InsightContext = { researchSummaries: manyStale, now: NOW };
    const result = generateInsights(ctx);
    const stale = result.find((i) => i.id.includes("stale-research"));
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe("action-needed"); // > 3 → action-needed
  });
});

// ---------------------------------------------------------------------------
// Rule: Missing categories
// ---------------------------------------------------------------------------

describe("missing categories", () => {
  it("flags positions without sector", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ sector: null })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const sector = result.find((i) => i.id.includes("missing-sector"));
    expect(sector).toBeDefined();
    expect(sector!.severity).toBe("notice");
  });

  it("flags positions without theme", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ theme: null })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const theme = result.find((i) => i.id.includes("missing-theme"));
    expect(theme).toBeDefined();
    expect(theme!.severity).toBe("info");
  });

  it("can flag both sector and theme for same position", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ sector: null, theme: null })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    expect(result.find((i) => i.id.includes("missing-sector"))).toBeDefined();
    expect(result.find((i) => i.id.includes("missing-theme"))).toBeDefined();
  });

  it("does NOT flag when all have categories", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ sector: "Tech", theme: "AI" })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    expect(result.find((i) => i.id.includes("missing-sector"))).toBeUndefined();
    expect(result.find((i) => i.id.includes("missing-theme"))).toBeUndefined();
  });

  it("trims whitespace from sector/theme", () => {
    // Empty string after trim should count as missing
    const ctx: InsightContext = {
      positions: [makePosition({ sector: "   ", theme: "  " })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    expect(result.find((i) => i.id.includes("missing-sector"))).toBeDefined();
    expect(result.find((i) => i.id.includes("missing-theme"))).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: Invalid research notes
// ---------------------------------------------------------------------------

describe("invalid research notes", () => {
  it("flags an invalid note without also calling it missing", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ symbol: "9998.TW" })],
      researchSummaries: [],
      invalidResearchSymbols: ["9998.TW"],
      now: NOW,
    };

    const result = generateInsights(ctx);
    expect(
      result.find((i) => i.id.includes("invalid-research-note")),
    ).toBeDefined();
    expect(
      result.find((i) => i.id.includes("missing-research-note")),
    ).toBeUndefined();
  });

  it("does not infer missing metadata from a note that failed validation", () => {
    const ctx: InsightContext = {
      positions: [
        makePosition({
          symbol: "9998.TW",
          conviction: null,
          sector: null,
          theme: null,
        }),
      ],
      researchSummaries: [],
      invalidResearchSymbols: ["9998.tw"],
      now: NOW,
    };

    const result = generateInsights(ctx);
    expect(
      result.find((i) => i.id.includes("invalid-research-note")),
    ).toBeDefined();
    expect(
      result.find((i) => i.id.includes("missing-rationale")),
    ).toBeUndefined();
    expect(result.find((i) => i.id.includes("missing-sector"))).toBeUndefined();
    expect(result.find((i) => i.id.includes("missing-theme"))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: Missing research notes
// ---------------------------------------------------------------------------

describe("missing research notes", () => {
  it("does not infer missing notes when research was not loaded", () => {
    const result = generateInsights({
      positions: [makePosition({ symbol: "2330.TW" })],
      now: NOW,
    });

    expect(
      result.find((i) => i.id.includes("missing-research-note")),
    ).toBeUndefined();
  });

  it("flags positions without matching research after a successful empty scan", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ symbol: "NEW.TW" })],
      researchSummaries: [],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const missing = result.find((i) => i.id.includes("missing-research-note"));
    expect(missing).toBeDefined();
    expect(missing!.severity).toBe("action-needed");
  });

  it("does NOT flag when research exists for all positions", () => {
    const ctx: InsightContext = {
      positions: [makePosition({ symbol: "2330.TW" })],
      researchSummaries: [makeResearch({ symbol: "2330.TW" })],
      now: NOW,
    };
    const result = generateInsights(ctx);
    const missing = result.find((i) => i.id.includes("missing-research-note"));
    expect(missing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule: Empty portfolio
// ---------------------------------------------------------------------------

describe("empty portfolio", () => {
  it("produces info insight when no positions", () => {
    const ctx: InsightContext = { positions: [], now: NOW };
    const result = generateInsights(ctx);
    const empty = result.find((i) => i.id.includes("empty-portfolio"));
    expect(empty).toBeDefined();
    expect(empty!.severity).toBe("info");
  });

  it("produces info insight when positions undefined", () => {
    const ctx: InsightContext = { now: NOW };
    const result = generateInsights(ctx);
    const empty = result.find((i) => i.id.includes("empty-portfolio"));
    expect(empty).toBeDefined();
  });

  it("does NOT produce empty-portfolio when positions exist", () => {
    const ctx: InsightContext = { positions: [makePosition()], now: NOW };
    const result = generateInsights(ctx);
    const empty = result.find((i) => i.id.includes("empty-portfolio"));
    expect(empty).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 1 trust rules: reconciliation and freshness
// ---------------------------------------------------------------------------

describe("cash freshness", () => {
  const reconciliation = {
    cashAsOfDate: "2026-06-25",
    pendingSettlements: [],
  };

  it.each([
    ["2026-07-02T12:00:00Z", undefined],
    ["2026-07-03T12:00:00Z", "action-needed"],
  ] as const)(
    "fires only beyond the default 7-day boundary at %s",
    (now, severity) => {
      const insight = generateInsights({ reconciliation, now }).find((item) =>
        item.id.includes("cash-freshness"),
      );
      expect(insight?.severity).toBe(severity);
    },
  );

  it("supports one configurable threshold without changing the stable ID", () => {
    const insight = generateInsights({
      reconciliation,
      cashStaleAfterDays: 2,
      now: "2026-06-28T12:00:00Z",
    }).find((item) => item.id.includes("cash-freshness"));

    expect(insight?.id).toBe(`insight-${INSIGHT_VERSION}-cash-freshness`);
    expect(insight?.severity).toBe("action-needed");
  });

  it("does not infer a problem when reconciliation was not evaluated", () => {
    expect(
      generateInsights({ now: NOW }).find((item) =>
        item.id.includes("cash-freshness"),
      ),
    ).toBeUndefined();
  });
});

describe("overdue settlements", () => {
  it("flags only overdue rows and sorts IDs for deterministic output", () => {
    const rows = [
      { id: "trade-z", symbol: "2454.TW", status: "overdue" as const },
      { id: "trade-p", symbol: "0050.TW", status: "pending" as const },
      { id: "trade-a", symbol: "2330.TW", status: "overdue" as const },
    ];
    const first = generateInsights({
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: rows,
      },
      now: NOW,
    }).find((item) => item.id.includes("overdue-settlement"));
    const second = generateInsights({
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: [...rows].reverse(),
      },
      now: NOW,
    }).find((item) => item.id.includes("overdue-settlement"));

    expect(first?.id).toBe(second?.id);
    expect(first?.id).toBe(`insight-${INSIGHT_VERSION}-overdue-settlement`);
    expect(first?.id).not.toContain("trade-a");
    expect(first?.severity).toBe("action-needed");
    expect(first?.description).not.toContain("0050.TW");

    const differentSet = generateInsights({
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: [
          {
            id: "trade-a-trade-z",
            symbol: "2330.TW",
            status: "overdue",
          },
        ],
      },
      now: NOW,
    }).find((item) => item.id.includes("overdue-settlement"));
    expect(differentSet?.id).toBe(first?.id);
  });
});

describe("missing trade net cashflow", () => {
  it("uses typed diagnostics and sorts safe trade IDs deterministically", () => {
    const first = generateInsights({
      tradeIntegrity: {
        missingNetCashflow: [
          { id: "trade-b", symbol: "2454.TW" },
          { id: "trade-a", symbol: "2330.TW" },
        ],
      },
      now: NOW,
    }).find((item) => item.id.includes("missing-net-cashflow"));
    const second = generateInsights({
      tradeIntegrity: {
        missingNetCashflow: [
          { id: "trade-a", symbol: "2330.TW" },
          { id: "trade-b", symbol: "2454.TW" },
        ],
      },
      now: NOW,
    }).find((item) => item.id.includes("missing-net-cashflow"));

    expect(first?.id).toBe(second?.id);
    expect(first?.id).toBe(`insight-${INSIGHT_VERSION}-missing-net-cashflow`);
    expect(first?.id).not.toContain("trade-a");
    expect(first?.severity).toBe("action-needed");
    expect(first?.description).not.toContain("/home/");

    const unsafe = generateInsights({
      tradeIntegrity: {
        missingNetCashflow: [
          {
            id: "/home/ubuntu/ObsidianVault/private.md",
            symbol: "/home/ubuntu/private",
          },
        ],
      },
      now: NOW,
    }).find((item) => item.id.includes("missing-net-cashflow"));
    expect(unsafe?.id).not.toContain("/home/");
    expect(unsafe?.description).not.toContain("/home/");

    const differentSet = generateInsights({
      tradeIntegrity: {
        missingNetCashflow: [{ id: "trade-a-trade-b", symbol: "2330.TW" }],
      },
      now: NOW,
    }).find((item) => item.id.includes("missing-net-cashflow"));
    expect(differentSet?.id).toBe(first?.id);
  });

  it("keeps aggregate IDs bounded for large diagnostic sets", () => {
    const insight = generateInsights({
      tradeIntegrity: {
        missingNetCashflow: Array.from({ length: 1_000 }, (_, index) => ({
          id: `order:broker:${index}`,
          symbol: "2330.TW",
        })),
      },
      now: NOW,
    }).find((item) => item.id.includes("missing-net-cashflow"));

    expect(insight?.id).toBe(`insight-${INSIGHT_VERSION}-missing-net-cashflow`);
    expect(insight?.id.length).toBeLessThan(100);
    expect(insight?.id).not.toContain("broker");
  });

  it("does not parse human-readable reconciliation warnings", () => {
    const insight = generateInsights({
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: [],
      },
      now: NOW,
    }).find((item) => item.id.includes("missing-net-cashflow"));
    expect(insight).toBeUndefined();
  });
});

describe("strategy equation integrity", () => {
  it.each([
    [-1, false],
    [1, false],
    [-1.01, true],
    [1.01, true],
  ] as const)(
    "applies the one-TWD tolerance to delta %s",
    (delta, expected) => {
      const insight = generateInsights({
        reconciliation: {
          cashAsOfDate: "2026-07-10",
          pendingSettlements: [],
          strategyEquationDelta: delta,
        },
        now: NOW,
      }).find((item) => item.id.includes("strategy-equation-mismatch"));

      expect(Boolean(insight)).toBe(expected);
      if (insight) {
        expect(insight.id).toBe(
          `insight-${INSIGHT_VERSION}-strategy-equation-mismatch`,
        );
        expect(insight.severity).toBe("action-needed");
      }
    },
  );

  it("does not infer a mismatch when the typed delta was not evaluated", () => {
    const insight = generateInsights({
      reconciliation: {
        cashAsOfDate: "2026-07-10",
        pendingSettlements: [],
      },
      now: NOW,
    }).find((item) => item.id.includes("strategy-equation-mismatch"));
    expect(insight).toBeUndefined();
  });
});

describe("financing integrity", () => {
  it.each(["needs-review", "partial"] as const)(
    "flags %s financing economics",
    (status) => {
      const insight = generateInsights({
        financing: { status, statusReason: "Baseline is incomplete" },
        now: NOW,
      }).find((item) => item.id.includes("financing-integrity"));
      expect(insight?.severity).toBe("action-needed");
      expect(insight?.description).toContain("Baseline is incomplete");
    },
  );

  it("qualifies partial financing economics as estimates", () => {
    const insight = generateInsights({
      financing: {
        status: "partial",
        statusReason:
          "Financing cost uses the current policy-loan interest estimate",
      },
      now: NOW,
    }).find((item) => item.id.includes("financing-integrity"));

    expect(insight?.description).toContain(
      "Net strategy value and net return are estimates",
    );
    expect(insight?.description).not.toContain(
      "must not be relied on until financing data is confirmed",
    );
  });

  it("does not flag confirmed financing economics", () => {
    expect(
      generateInsights({
        financing: { status: "confirmed", statusReason: null },
        now: NOW,
      }).find((item) => item.id.includes("financing-integrity")),
    ).toBeUndefined();
  });
});

describe("0050 benchmark freshness", () => {
  it("uses notice for stale data and unavailable calendar coverage", () => {
    for (const benchmark0050 of [
      {
        sourceStatus: "available" as const,
        freshness: "stale" as const,
        latestDate: "2026-07-09",
        expectedLatestDate: "2026-07-10",
      },
      {
        sourceStatus: "available" as const,
        freshness: "unavailable" as const,
        latestDate: "2026-07-10",
        expectedLatestDate: null,
      },
    ]) {
      const insight = generateInsights({ benchmark0050, now: NOW }).find(
        (item) => item.id.includes("benchmark-0050-freshness"),
      );
      expect(insight?.severity).toBe("notice");
    }
  });

  it.each(["missing", "invalid"] as const)(
    "uses action-needed when the source is %s",
    (sourceStatus) => {
      const insight = generateInsights({
        benchmark0050: {
          sourceStatus,
          freshness: "unavailable",
          latestDate: null,
          expectedLatestDate: "2026-07-10",
        },
        now: NOW,
      }).find((item) => item.id.includes("benchmark-0050-freshness"));
      expect(insight?.severity).toBe("action-needed");
    },
  );

  it("does not flag a fresh source or an unevaluated source", () => {
    const fresh = generateInsights({
      benchmark0050: {
        sourceStatus: "available",
        freshness: "fresh",
        latestDate: "2026-07-10",
        expectedLatestDate: "2026-07-10",
      },
      now: NOW,
    });
    expect(
      fresh.find((item) => item.id.includes("benchmark-0050-freshness")),
    ).toBeUndefined();
    expect(
      generateInsights({ now: NOW }).find((item) =>
        item.id.includes("benchmark-0050-freshness"),
      ),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: multiple rules fire together
// ---------------------------------------------------------------------------

describe("integration", () => {
  it("generates multiple insights from realistic data", () => {
    const ctx: InsightContext = {
      positions: [
        // Stale price, no conviction, no sector, no theme, no research note
        makePosition({
          symbol: "BAD.TW",
          name: "Bad Stock",
          lastChecked: "2026-06-01",
          conviction: null,
          sector: null,
          theme: null,
          marketValue: 500_000,
        }),
        // Smaller position, fine
        makePosition({
          symbol: "GOOD.TW",
          name: "Good Stock",
          marketValue: 100_000,
        }),
      ],
      researchSummaries: [makeResearch({ symbol: "GOOD.TW" })],
      now: NOW,
    };

    const result = generateInsights(ctx);

    // Should have: stale-prices (BAD), missing-rationale (BAD),
    // high-concentration (BAD at 83%), missing-sector (BAD),
    // missing-theme (BAD), missing-research-note (BAD)
    expect(result.length).toBeGreaterThanOrEqual(5);

    // Verify all IDs are unique
    const ids = result.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Verify order is deterministic
    const result2 = generateInsights(ctx);
    expect(result).toEqual(result2);
  });

  it("returns empty array when no data at all", () => {
    const result = generateInsights({ now: NOW });
    // Only empty-portfolio fires
    expect(result.length).toBe(1);
    expect(result[0].id).toContain("empty-portfolio");
  });
});
