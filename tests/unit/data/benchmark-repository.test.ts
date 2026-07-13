import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    default: { ...actual, readFileSync: mockReadFileSync },
  };
});
vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));
vi.mock("@/lib/config", () => ({
  config: Object.freeze({ obsidianVaultPath: "/fixture-vault" }),
}));

import { benchmarkSeries } from "@/lib/data/benchmark-repository";

const payload = () => ({
  version: 1,
  symbol: "0050.TW",
  name: "元大台灣50",
  basis: "adjusted-close-total-return-proxy",
  currency: "TWD",
  exchangeTimezone: "Asia/Taipei",
  source: "yfinance",
  sourceVersion: "0.2.66",
  fetchedAt: "2026-07-13T15:00:00+08:00",
  points: [
    {
      date: "2026-07-10",
      close: 203,
      adjustedClose: 201.5,
      volume: 10_000,
    },
    {
      date: "2026-07-13",
      close: 205,
      adjustedClose: 203.5,
      volume: 12_000,
    },
  ],
});

describe("benchmarkSeries", () => {
  beforeEach(() => mockReadFileSync.mockReset());

  it("reads a fresh strict artifact from the canonical readonly vault path", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(payload()));

    const result = benchmarkSeries("0050.TW", "2026-07-13T15:30:00+08:00");

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.freshness).toBe("fresh");
    expect(result.value.latestDate).toBe("2026-07-13");
    expect(result.value.expectedLatestDate).toBe("2026-07-13");
    expect(result.value.warnings).toEqual([]);
    expect(mockReadFileSync).toHaveBeenCalledWith(
      "/fixture-vault/Trading/Portfolio/Benchmarks/0050.TW.json",
      "utf8",
    );
  });

  it("reports a stale last-known-good series without pretending it is current", () => {
    const stale = payload();
    stale.points = stale.points.slice(0, 1);
    mockReadFileSync.mockReturnValue(JSON.stringify(stale));

    const result = benchmarkSeries("0050.TW", "2026-07-13T15:30:00+08:00");

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.freshness).toBe("stale");
    expect(result.value.warnings).toEqual([
      "Benchmark latest date 2026-07-10 is older than expected TWSE session 2026-07-13",
    ]);
  });

  it("marks freshness unavailable outside verified calendar coverage", () => {
    mockReadFileSync.mockReturnValue(JSON.stringify(payload()));

    const result = benchmarkSeries("0050.TW", "2027-07-13T15:30:00+08:00");

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.freshness).toBe("unavailable");
    expect(result.value.expectedLatestDate).toBeNull();
    expect(result.value.warnings).toEqual([
      "Benchmark freshness unavailable outside verified TWSE calendar coverage",
    ]);
  });

  it("fails closed on unreadable, malformed, invalid, and future-dated artifacts", () => {
    for (const source of [
      new Error("ENOENT /fixture-vault/private"),
      "{not-json",
      JSON.stringify({ ...payload(), basis: "price-index" }),
      JSON.stringify({
        ...payload(),
        points: [
          ...payload().points,
          {
            date: "2026-07-14",
            close: 206,
            adjustedClose: 204,
            volume: 10_000,
          },
        ],
      }),
    ]) {
      if (source instanceof Error) mockReadFileSync.mockImplementation(() => { throw source; });
      else mockReadFileSync.mockReturnValue(source);

      const result = benchmarkSeries("0050.TW", "2026-07-13T15:30:00+08:00");

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toMatch(/^BENCHMARK_/);
      expect(JSON.stringify(result.error)).not.toContain("/fixture-vault");
      mockReadFileSync.mockReset();
    }
  });
});
