/**
 * Tests for portfolio-repository.ts — position, trade, and snapshot data.
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

// Now import the module under test
import {
  listOpenPositions,
  getPosition,
  getTrades,
  getDailySnapshots,
} from "@/lib/data/portfolio-repository";

// ---------------------------------------------------------------------------
// listOpenPositions
// ---------------------------------------------------------------------------

describe("listOpenPositions", () => {
  it("returns all open positions (excludes closed)", () => {
    const result = listOpenPositions();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    // Should have 3 open positions: 2330.TW, 2454.TW, 0050.TW
    // 3711.TW is closed and should be excluded
    expect(result.value).toHaveLength(3);

    const symbols = result.value.map((p) => p.symbol).sort();
    expect(symbols).toEqual(["0050.TW", "2330.TW", "2454.TW"]);
  });

  it("each position has required fields", () => {
    const result = listOpenPositions();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    for (const pos of result.value) {
      expect(pos.symbol).toBeTruthy();
      expect(pos.name).toBeTruthy();
      expect(typeof pos.shares).toBe("number");
      expect(typeof pos.avgCost).toBe("number");
    }
  });

  it("parses position with sector and theme", () => {
    const result = listOpenPositions();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    const tsmc = result.value.find((p) => p.symbol === "2330.TW");
    expect(tsmc).toBeDefined();
    expect(tsmc!.sector).toBe("Semiconductors");
    expect(tsmc!.theme).toBe("AI / HPC");
    expect(tsmc!.conviction).toBe(5);
  });

  it("parses position without sector (unclassified)", () => {
    const result = listOpenPositions();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    const etf = result.value.find((p) => p.symbol === "0050.TW");
    expect(etf).toBeDefined();
    expect(etf!.sector).toBeNull();
    expect(etf!.theme).toBe("Broad Market");
  });
});

// ---------------------------------------------------------------------------
// getPosition
// ---------------------------------------------------------------------------

describe("getPosition", () => {
  it("finds a position by symbol", () => {
    const result = getPosition("2330.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value.symbol).toBe("2330.TW");
    expect(result.value.name).toBe("台積電");
    expect(result.value.shares).toBe(1000);
  });

  it("is case-insensitive for symbol lookup", () => {
    const result = getPosition("2330.tw");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.symbol).toBe("2330.TW");
  });

  it("returns error for non-existent symbol", () => {
    const result = getPosition("9999.TW");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_POSITION_NOT_FOUND");
    }
  });

  it("returns error for closed position", () => {
    const result = getPosition("3711.TW");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VAULT_POSITION_CLOSED");
    }
  });
});

// ---------------------------------------------------------------------------
// getTrades
// ---------------------------------------------------------------------------

describe("getTrades", () => {
  it("finds all trades for a symbol", () => {
    const result = getTrades("2330.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value).toHaveLength(2);

    const sides = result.value.map((t) => t.side).sort();
    expect(sides).toEqual(["buy", "sell"]);

    // Check buy trade
    const buy = result.value.find((t) => t.side === "buy");
    expect(buy).toBeDefined();
    expect(buy!.shares).toBe(500);
    expect(buy!.price).toBe(570);
    expect(buy!.grossAmount).toBe(285000);
    expect(buy!.feeTax).toBe(405);

    // Check sell trade
    const sell = result.value.find((t) => t.side === "sell");
    expect(sell).toBeDefined();
    expect(sell!.shares).toBe(200);
    expect(sell!.price).toBe(595);
    expect(sell!.netCashflow).toBe(118830);
  });

  it("returns empty array for symbol with no trades", () => {
    const result = getTrades("0050.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value).toEqual([]);
  });

  it("returns empty array for non-existent symbol", () => {
    const result = getTrades("9999.TW");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDailySnapshots
// ---------------------------------------------------------------------------

describe("getDailySnapshots", () => {
  it("returns all snapshots after a given date", () => {
    const result = getDailySnapshots("2026-07-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    // Should include 2026-07-01 and 2026-07-07, but not 2026-06-30
    expect(result.value).toHaveLength(2);
    expect(result.value[0].date).toBe("2026-07-01");
    expect(result.value[1].date).toBe("2026-07-07");
  });

  it("returns all snapshots when since is early enough", () => {
    const result = getDailySnapshots("2026-01-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    expect(result.value).toHaveLength(3);
    expect(result.value[0].date).toBe("2026-06-30");
    expect(result.value[1].date).toBe("2026-07-01");
    expect(result.value[2].date).toBe("2026-07-07");
  });

  it("returns empty array when no snapshots match", () => {
    const result = getDailySnapshots("2026-12-31");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value).toEqual([]);
  });

  it("snapshots are sorted ascending by date", () => {
    const result = getDailySnapshots("2026-01-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    for (let i = 1; i < result.value.length; i++) {
      expect(result.value[i].date >= result.value[i - 1].date).toBe(true);
    }
  });

  it("each snapshot has date and totalValue", () => {
    const result = getDailySnapshots("2026-01-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");

    for (const snap of result.value) {
      expect(snap.date).toBeTruthy();
      expect(typeof snap.totalValue).toBe("number");
    }
  });
});
