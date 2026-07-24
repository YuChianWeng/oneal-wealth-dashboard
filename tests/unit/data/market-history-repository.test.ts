import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  intradaySession,
  marketSession,
} from "@/lib/data/market-history-repository";

describe("market history session selection", () => {
  it("selects night session after 15:00 Taipei", () => {
    const reference = new Date("2026-07-21T14:00:00.000Z"); // 22:00 Taipei
    expect(marketSession(reference)).toBe("night");
    expect(intradaySession(reference)).toEqual({
      date: "2026-07-21",
      session: "night",
    });
  });

  it("keeps after-midnight quotes in the previous trading night's file", () => {
    const reference = new Date("2026-07-21T18:00:00.000Z"); // 02:00 Taipei, Jul 22
    expect(marketSession(reference)).toBe("night");
    expect(intradaySession(reference)).toEqual({
      date: "2026-07-21",
      session: "night",
    });
  });

  it("selects day history outside the night session", () => {
    const reference = new Date("2026-07-21T01:00:00.000Z"); // 09:00 Taipei
    expect(marketSession(reference)).toBe("day");
    expect(intradaySession(reference)).toEqual({
      date: "2026-07-21",
      session: "day",
    });
  });
});
