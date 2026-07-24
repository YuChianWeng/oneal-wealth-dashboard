import { describe, expect, it } from "vitest";
import {
  formatIntradayAxis,
  toIntradayChartData,
} from "@/components/market/intraday-line-chart";
import { marketSourceLabel } from "@/components/market/live-market-ticker";
import type { IntradayMarketHistory } from "@/lib/schemas/market";

describe("toIntradayChartData", () => {
  it("aligns provider timestamps to minutes and keeps missing values null", () => {
    const history: IntradayMarketHistory = {
      version: 1,
      date: "2026-07-21",
      session: "day",
      observedAt: "2026-07-21T09:01:00+08:00",
      taiex: [
        { timestamp: "2026-07-21T09:00:35+08:00", value: 44000 },
        { timestamp: "2026-07-21T09:00:55+08:00", value: 44005 },
        { timestamp: "2026-07-21T09:01:00+08:00", value: 44010 },
      ],
      txf: [{ timestamp: "2026-07-21T09:00:02+08:00", value: 44200 }],
    };

    expect(toIntradayChartData(history)).toEqual([
      {
        timestamp: "2026-07-21T01:00:00.000Z",
        label: "09:00",
        taiex: 44005,
        txf: 44200,
      },
      {
        timestamp: "2026-07-21T01:01:00.000Z",
        label: "09:01",
        taiex: 44010,
        txf: null,
      },
    ]);
  });
});

describe("formatIntradayAxis", () => {
  it("keeps index values readable", () => {
    expect(formatIntradayAxis(44232.87)).toBe("44,233");
  });
});

describe("marketSourceLabel", () => {
  it("names the provider used by the index and futures quote", () => {
    expect(marketSourceLabel("twse")).toBe("TWSE MIS");
    expect(marketSourceLabel("taifex")).toBe("TAIFEX MIS");
  });
});
