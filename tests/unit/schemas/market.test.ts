import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  MarketSnapshotSchema,
  IntradayMarketHistorySchema,
} from "@/lib/schemas/market";

const quote = {
  symbol: "TAIEX",
  name: "發行量加權股價指數",
  last: 44232.87,
  reference: 42449.7,
  change: 1783.17,
  changePct: 4.2,
  observedAt: "2026-07-21T17:40:00+08:00",
  providerSnapshotAt: "2026-07-21T13:33:00+08:00",
  source: "twse",
  marketSession: "closed",
  dataStatus: "closed_snapshot",
  isStale: false,
  snapshotAgeSeconds: 0,
  contract: null,
} as const;

describe("MarketSnapshotSchema", () => {
  it("accepts a mixed TAIEX, night TXF, and stock snapshot", () => {
    const result = MarketSnapshotSchema.parse({
      version: 1,
      observedAt: "2026-07-21T17:40:00+08:00",
      stocks: [
        {
          ...quote,
          symbol: "2330",
          name: "台積電",
          source: "kgi",
          providerSnapshotAt: "2026-07-21T17:40:00+08:00",
          marketSession: "closed",
          dataStatus: "closed_snapshot",
        },
      ],
      indices: { taiex: quote },
      futures: {
        txf: {
          ...quote,
          symbol: "TXF",
          name: "臺指期",
          source: "taifex",
          marketSession: "night",
          dataStatus: "live",
          contract: "TXFH6",
        },
      },
      errors: [],
    });
    expect(result.indices.taiex?.last).toBe(44232.87);
    expect(result.futures.txf?.marketSession).toBe("night");
  });

  it("rejects non-finite values and unknown source fields", () => {
    expect(() =>
      MarketSnapshotSchema.parse({
        version: 1,
        observedAt: "2026-07-21T17:40:00+08:00",
        stocks: [{ ...quote, source: "unknown", last: Number.NaN }],
        indices: { taiex: null },
        futures: { txf: null },
        errors: [],
      }),
    ).toThrow();
  });

  it("accepts day-session line-chart history", () => {
    const result = IntradayMarketHistorySchema.parse({
      version: 1,
      date: "2026-07-21",
      session: "day",
      observedAt: "2026-07-21T13:34:00+08:00",
      taiex: [
        { timestamp: "2026-07-21T09:00:00+08:00", value: 44100 },
      ],
      txf: [
        { timestamp: "2026-07-21T09:00:00+08:00", value: 44320 },
      ],
    });
    expect(result.session).toBe("day");
    expect(result.taiex).toHaveLength(1);
  });

  it("accepts night-session line-chart history", () => {
    const result = IntradayMarketHistorySchema.parse({
      version: 1,
      date: "2026-07-21",
      session: "night",
      observedAt: "2026-07-21T22:34:00+08:00",
      taiex: [],
      txf: [
        { timestamp: "2026-07-21T22:34:00+08:00", value: 44320 },
      ],
    });
    expect(result.session).toBe("night");
    expect(result.txf).toHaveLength(1);
  });
});
