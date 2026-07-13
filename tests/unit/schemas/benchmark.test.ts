import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));

import { BenchmarkArtifactSchema } from "@/lib/schemas/benchmark";

const artifact = () => ({
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
      dividend: 0,
      stockSplit: 0,
    },
    {
      date: "2026-07-13",
      close: 205,
      adjustedClose: 203.5,
      volume: 12_000,
    },
  ],
});

describe("BenchmarkArtifactSchema", () => {
  it("preserves the leading-zero ticker and strict producer metadata", () => {
    const parsed = BenchmarkArtifactSchema.parse(artifact());

    expect(parsed.symbol).toBe("0050.TW");
    expect(parsed.basis).toBe("adjusted-close-total-return-proxy");
    expect(parsed.points.at(-1)?.adjustedClose).toBe(203.5);
  });

  it("rejects metadata drift, malformed timestamps, and extra fields", () => {
    expect(() =>
      BenchmarkArtifactSchema.parse({ ...artifact(), basis: "price-index" }),
    ).toThrow();
    expect(() =>
      BenchmarkArtifactSchema.parse({
        ...artifact(),
        fetchedAt: "2026-07-13T15:00:00Z",
      }),
    ).toThrow();
    expect(() =>
      BenchmarkArtifactSchema.parse({ ...artifact(), privatePath: "/vault" }),
    ).toThrow();
  });

  it("rejects invalid, duplicate, or unordered points and non-finite prices", () => {
    expect(() =>
      BenchmarkArtifactSchema.parse({
        ...artifact(),
        points: [
          artifact().points[1],
          artifact().points[0],
        ],
      }),
    ).toThrow();
    expect(() =>
      BenchmarkArtifactSchema.parse({
        ...artifact(),
        points: [
          artifact().points[0],
          { ...artifact().points[0], adjustedClose: Number.NaN },
        ],
      }),
    ).toThrow();
    expect(() =>
      BenchmarkArtifactSchema.parse({
        ...artifact(),
        points: [{ ...artifact().points[0], date: "2026-02-30" }],
      }),
    ).toThrow();
  });

  it("requires positive volume for the 0050 proxy", () => {
    const withoutVolume = artifact().points.map(({ volume: _volume, ...point }) =>
      point,
    );

    expect(() =>
      BenchmarkArtifactSchema.parse({ ...artifact(), points: withoutVolume }),
    ).toThrow();
  });

  it("accepts the secondary TAIEX price-index contract without volume", () => {
    const twii = {
      ...artifact(),
      symbol: "^TWII",
      name: "TAIEX 加權指數",
      basis: "price-index",
      points: artifact().points.map(({ volume: _volume, ...point }) => point),
    };

    expect(BenchmarkArtifactSchema.parse(twii).symbol).toBe("^TWII");
  });
});
