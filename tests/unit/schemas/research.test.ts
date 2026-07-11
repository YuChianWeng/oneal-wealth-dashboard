import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import { ResearchSummarySchema } from "@/lib/schemas/research";

// ---------------------------------------------------------------------------
// ResearchSummary
// ---------------------------------------------------------------------------
describe("ResearchSummarySchema", () => {
  const valid = {
    symbol: "2330.TW",
    name: "TSMC",
    status: "hold",
    thesis: "Global semiconductor leader with structural demand growth driven by AI/HPC",
    catalysts: "N3 ramp, advanced packaging capacity expansion",
    risks: "Geopolitical tension, cyclical semiconductor downturn",
    invalidation: "Loss of technology leadership or major customer concentration shift",
    nextStep: "Monitor monthly revenue and capex guidance",
    sourceChecked: "2026-07-10",
  };

  it("accepts valid research summary", () => {
    expect(ResearchSummarySchema.parse(valid)).toEqual(valid);
  });

  it("accepts nullable string fields as null", () => {
    const data = {
      ...valid,
      thesis: null,
      catalysts: null,
      risks: null,
      invalidation: null,
      nextStep: null,
      sourceChecked: null,
      sector: null,
      theme: null,
      conviction: null,
    };
    expect(ResearchSummarySchema.parse(data)).toEqual(data);
  });

  it("rejects extra fields (strict mode)", () => {
    expect(() =>
      ResearchSummarySchema.parse({ ...valid, rawNotePath: "/vault/trading/stocks/2330.md" }),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      ResearchSummarySchema.parse({ symbol: "2330.TW" }),
    ).toThrow();
  });

  it("rejects bad sourceChecked date format", () => {
    expect(() =>
      ResearchSummarySchema.parse({ ...valid, sourceChecked: "not-a-date" }),
    ).toThrow();
  });

  it("rejects conviction outside 1-5", () => {
    expect(() =>
      ResearchSummarySchema.parse({ ...valid, conviction: 0 }),
    ).toThrow();
    expect(() =>
      ResearchSummarySchema.parse({ ...valid, conviction: 6 }),
    ).toThrow();
  });
});
