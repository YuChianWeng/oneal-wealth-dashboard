/**
 * Tests for vault-reader.ts — safe vault file reader.
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

import { readNote, listNotes } from "@/lib/data/vault-reader";

// ---------------------------------------------------------------------------
// readNote
// ---------------------------------------------------------------------------

describe("readNote", () => {
  it("reads a valid position note and parses frontmatter", () => {
    const result = readNote("Trading/Portfolio/Positions/2330.TW.position.md");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value.path).toBe(
      "Trading/Portfolio/Positions/2330.TW.position.md",
    );
    expect(result.value.frontmatter.symbol).toBe("2330.TW");
    expect(result.value.frontmatter.name).toBe("台積電");
    expect(result.value.frontmatter.shares).toBe(1000);
    expect(result.value.content).toContain("Open position");
  });

  it("reads a stock research note with body sections", () => {
    const result = readNote("Trading/Stocks/2330.TW.stock-note.md");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value.frontmatter.symbol).toBe("2330.TW");
    expect(result.value.frontmatter.status).toBe("hold");
    expect(result.value.content).toContain("## Thesis");
    expect(result.value.content).toContain("## Catalysts");
    expect(result.value.content).toContain("## Risks");
    expect(result.value.content).toContain("## Invalidation");
    expect(result.value.content).toContain("## Next Step");
  });

  it("rejects path with .. traversal", () => {
    const result = readNote(
      "Trading/Portfolio/Positions/../../../etc/passwd.md",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_PATH_TRAVERSAL");
    }
  });

  it("rejects path outside whitelisted directories", () => {
    const result = readNote("Trading/Daily/2026-07-01.md");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_PATH_OUTSIDE_WHITELIST");
    }
  });

  it("returns error for non-existent file", () => {
    const result = readNote(
      "Trading/Portfolio/Positions/NONEXIST.TW.position.md",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_READ_ERROR");
    }
  });

  it("rejects paths escaping through root traversal", () => {
    const result = readNote("../../../../../etc/passwd.md");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_PATH_TRAVERSAL");
    }
  });
});

// ---------------------------------------------------------------------------
// listNotes
// ---------------------------------------------------------------------------

describe("listNotes", () => {
  it("lists all .md files in a whitelisted directory", () => {
    const result = listNotes("Trading/Portfolio/Positions");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value.length).toBeGreaterThanOrEqual(3);
    expect(result.value.some((f: string) => f.includes("2330.TW"))).toBe(true);
    expect(result.value.some((f: string) => f.includes("2454.TW"))).toBe(true);
    expect(result.value.some((f: string) => f.includes("0050.TW"))).toBe(true);
  });

  it("returns only .md files", () => {
    const result = listNotes("Trading/Portfolio/Positions");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    for (const f of result.value) {
      expect(f).toMatch(/\.md$/);
    }
  });

  it("rejects listing outside whitelisted directories", () => {
    const result = listNotes("Some/Random/Folder");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_PATH_OUTSIDE_WHITELIST");
    }
  });

  it("rejects path traversal in directory listing", () => {
    const result = listNotes("Trading/Portfolio/Positions/../../../etc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_PATH_TRAVERSAL");
    }
  });
});
