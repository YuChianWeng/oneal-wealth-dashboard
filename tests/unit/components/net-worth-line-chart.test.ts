import { describe, expect, it } from "vitest";
import { formatNetWorthAxis } from "@/components/overview/net-worth-line-chart";

describe("formatNetWorthAxis", () => {
  it("formats ordinary net-worth values without collapsing them to 0K", () => {
    expect(formatNetWorthAxis(100)).toBe("100");
    expect(formatNetWorthAxis(25_552)).toBe("2.6萬");
    expect(formatNetWorthAxis(232_623.5)).toBe("23.3萬");
  });

  it("keeps negative net worth legible", () => {
    expect(formatNetWorthAxis(-12_000)).toBe("−1.2萬");
  });
});
