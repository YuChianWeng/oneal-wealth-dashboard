/**
 * Tests for research-repository.ts — stock research data.
 */

import { describe, expect, it, vi } from "vitest";

// Mock config to point at our fixtures
vi.mock("@/lib/config", () => {
  const vaultPath = __dirname + "/../../../lib/data/__fixtures__/vault";
  return {
    config: Object.freeze({
      financeDbPath: "/tmp/test-finance.db",
      obsidianVaultPath: vaultPath,
      timezone: "Asia/Taipei",
      origin: "http://localhost:3000",
      port: 3000,
      vaultRoot: vaultPath,
      dataRoot: "/tmp/test-data",
      warnings: Object.freeze([]),
    }),
  };
});

// Mock server-only
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  getResearchSummary,
  listResearchSummariesForSymbols,
} from "@/lib/data/research-repository";

// ---------------------------------------------------------------------------
// getResearchSummary
// ---------------------------------------------------------------------------

describe("getResearchSummary", () => {
  it("extracts thesis, catalysts, risks, invalidation, nextStep from a full note", () => {
    const result = getResearchSummary("2330.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    const summary = result.value;
    expect(summary.symbol).toBe("2330.TW");
    expect(summary.name).toBe("台積電");
    expect(summary.status).toBe("hold");
    expect(summary.sector).toBe("Semiconductors");
    expect(summary.theme).toBe("AI / HPC");
    expect(summary.conviction).toBe(5);

    // Structured sections
    expect(summary.thesis).toContain("leading semiconductor foundry");
    expect(summary.catalysts).toContain("NVIDIA Blackwell");
    expect(summary.risks).toContain("Geopolitical");
    expect(summary.invalidation).toContain("550 TWD");
    expect(summary.nextStep).toContain("Q3 2026 earnings");
  });

  it("returns frontmatter fields when present", () => {
    const result = getResearchSummary("2330.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value.sourceChecked).toBe("2026-07-01");
    expect(result.value.lastUpdated).toBe("2026-07-10");
  });

  it("returns null for missing sections (empty fields, not errors)", () => {
    const result = getResearchSummary("0050.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    const summary = result.value;
    expect(summary.symbol).toBe("0050.TW");
    expect(summary.name).toBe("元大台灣50");
    expect(summary.thesis).toBeNull();
    expect(summary.catalysts).toBeNull();
    expect(summary.risks).toBeNull();
    expect(summary.invalidation).toBeNull();
    expect(summary.nextStep).toBeNull();
  });

  it("returns null for optional fields when not in frontmatter", () => {
    const result = getResearchSummary("0050.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value.sector).toBeNull();
    expect(result.value.conviction).toBeNull();
  });

  it("returns error for non-existent symbol", () => {
    const result = getResearchSummary("9999.TW");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_RESEARCH_NOT_FOUND");
    }
  });

  it("extracts note with partial sections", () => {
    const result = getResearchSummary("2454.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    const summary = result.value;
    expect(summary.symbol).toBe("2454.TW");
    expect(summary.name).toBe("聯發科");
    expect(summary.status).toBe("hold");

    // Has thesis but no other sections
    expect(summary.thesis).toContain("MediaTek");
    expect(summary.catalysts).toBeNull();
    expect(summary.risks).toBeNull();
    expect(summary.invalidation).toBeNull();
    expect(summary.nextStep).toBeNull();
  });

  it("is case-insensitive for symbol lookup", () => {
    const result = getResearchSummary("2330.tw");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.symbol).toBe("2330.TW");
  });
});

// ---------------------------------------------------------------------------
// listResearchSummariesForSymbols
// ---------------------------------------------------------------------------

describe("listResearchSummariesForSymbols", () => {
  it("indexes multiple requested symbols in one result", () => {
    const result = listResearchSummariesForSymbols([
      "2330.TW",
      "0050.tw",
      "9999.TW",
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect([...result.value.summaries.keys()]).toEqual([
      "2330.TW",
      "0050.TW",
    ]);
    expect(result.value.summaries.get("2330.TW")?.conviction).toBe(5);
    expect(result.value.summaries.get("0050.TW")?.name).toBe(
      "元大台灣50",
    );
    expect(result.value.invalid).toEqual([]);
  });

  it("normalizes a Yahoo .TWO alias to the vault-facing .TW symbol", () => {
    const result = listResearchSummariesForSymbols(["2330.TWO"]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.summaries.has("2330.TW")).toBe(true);
  });

  it("reports an invalid matching note separately from a missing note", () => {
    const result = listResearchSummariesForSymbols([
      "9998.TW",
      "9999.TW",
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.summaries.size).toBe(0);
    expect(result.value.invalid).toEqual([
      { symbol: "9998.TW", code: "VAULT_INVALID_RESEARCH" },
    ]);
  });
});
