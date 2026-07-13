import { describe, expect, it } from "vitest";
import {
  hasVerifiedTwseCalendar,
  isTwseTradingDay,
  latestCompletedTwseTradingDay,
} from "@/lib/market/twse-calendar";

describe("TWSE market calendar", () => {
  it("recognizes weekends and verified 2026 holidays", () => {
    expect(isTwseTradingDay("2026-07-11")).toBe(false);
    expect(isTwseTradingDay("2026-04-06")).toBe(false);
    expect(isTwseTradingDay("2026-07-10")).toBe(true);
  });

  it("uses Friday before Monday's price-update window", () => {
    expect(latestCompletedTwseTradingDay("2026-07-13T09:00:00+08:00")).toBe(
      "2026-07-10",
    );
  });

  it("uses Monday after the price-update window", () => {
    expect(latestCompletedTwseTradingDay("2026-07-13T15:00:00+08:00")).toBe(
      "2026-07-13",
    );
  });

  it("fails closed when the annual holiday calendar is not verified", () => {
    expect(hasVerifiedTwseCalendar("2026-12-31")).toBe(true);
    expect(hasVerifiedTwseCalendar("2027-01-04")).toBe(false);
    expect(
      latestCompletedTwseTradingDay("2027-01-04T15:00:00+08:00"),
    ).toBeNull();
  });

  it("walks across the Qingming long holiday", () => {
    expect(latestCompletedTwseTradingDay("2026-04-07T09:00:00+08:00")).toBe(
      "2026-04-02",
    );
  });
});
