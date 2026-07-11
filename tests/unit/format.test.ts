import { describe, expect, it } from "vitest";
import {
  formatTWD,
  formatPercent,
  formatDate,
  formatRelativeFreshness,
  formatCompact,
} from "@/lib/format";

// ---------------------------------------------------------------------------
// formatTWD
// ---------------------------------------------------------------------------
describe("formatTWD", () => {
  it("formats zero", () => {
    expect(formatTWD(0)).toBe("NT$0");
  });

  it("formats an integer less than 1000", () => {
    expect(formatTWD(500)).toBe("NT$500");
  });

  it("formats thousands with comma separators", () => {
    expect(formatTWD(4_286_000)).toBe("NT$4,286,000");
  });

  it("formats large values with commas", () => {
    expect(formatTWD(12_345_678)).toBe("NT$12,345,678");
  });

  it("rounds to the nearest integer (no decimals)", () => {
    expect(formatTWD(1000.4)).toBe("NT$1,000");
    expect(formatTWD(1000.5)).toBe("NT$1,001");
    expect(formatTWD(999.5)).toBe("NT$1,000");
  });

  it("handles negative amounts gracefully (returns string representation)", () => {
    expect(formatTWD(-1500)).toBe("−NT$1,500");
  });

  it("handles NaN by returning a fallback", () => {
    expect(formatTWD(NaN)).toBe("NT$—");
  });

  it("handles Infinity by returning a fallback", () => {
    expect(formatTWD(Infinity)).toBe("NT$—");
    expect(formatTWD(-Infinity)).toBe("NT$—");
  });

  it("handles undefined / null via runtime type (called as TS after coercion)", () => {
    // The function accepts unknown — guards handle non-number values.
    expect(formatTWD(null as unknown as number)).toBe("NT$—");
    expect(formatTWD(undefined as unknown as number)).toBe("NT$—");
  });
});

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------
describe("formatPercent", () => {
  it("formats a positive value with + sign when signed=true", () => {
    expect(formatPercent(2.3, true)).toBe("+2.3%");
  });

  it("formats a negative value with − sign (minus sign, not hyphen)", () => {
    expect(formatPercent(-4.1, true)).toBe("−4.1%");
  });

  it("formats zero with signed=true", () => {
    expect(formatPercent(0, true)).toBe("0.0%");
  });

  it("formats without sign when signed=false (default)", () => {
    expect(formatPercent(18.4)).toBe("18.4%");
  });

  it("formats one decimal place", () => {
    expect(formatPercent(2.36)).toBe("2.4%");
    expect(formatPercent(2.34)).toBe("2.3%");
  });

  it("handles NaN", () => {
    expect(formatPercent(NaN)).toBe("—%");
  });

  it("handles Infinity", () => {
    expect(formatPercent(Infinity)).toBe("—%");
    expect(formatPercent(-Infinity)).toBe("—%");
  });

  it("handles null / undefined", () => {
    expect(formatPercent(null as unknown as number)).toBe("—%");
    expect(formatPercent(undefined as unknown as number)).toBe("—%");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe("formatDate", () => {
  it("formats a Date object in Asia/Taipei locale", () => {
    // 2026-07-11 14:30 UTC+8 → 2026-07-11 in local Taipei time
    const d = new Date("2026-07-11T06:30:00Z"); // UTC 06:30 = Taipei 14:30
    const result = formatDate(d, "numeric");
    expect(result).toBe("2026/7/11");
  });

  it("formats a date string in Asia/Taipei locale", () => {
    const result = formatDate("2026-07-11", "numeric");
    expect(result).toBe("2026/7/11");
  });

  it("formats with short month name when format='short'", () => {
    const d = new Date("2026-07-11T06:30:00Z");
    const result = formatDate(d, "short");
    expect(result).toBe("7月11日");
  });

  it("defaults to 'numeric' format when not specified", () => {
    const d = new Date("2026-07-11T06:30:00Z");
    const result = formatDate(d);
    expect(result).toBe("2026/7/11");
  });

  it("handles invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate(new Date("invalid"))).toBe("—");
  });

  it("handles null / undefined", () => {
    expect(formatDate(null as unknown as Date)).toBe("—");
    expect(formatDate(undefined as unknown as Date)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatRelativeFreshness
// ---------------------------------------------------------------------------
describe("formatRelativeFreshness", () => {
  const REFERENCE = new Date("2026-07-11T06:30:00Z").getTime(); // fixed reference

  it("returns '剛剛' for a date within the last minute", () => {
    const recent = new Date(REFERENCE - 30_000); // 30s before reference
    expect(formatRelativeFreshness(recent, REFERENCE)).toBe("剛剛");
  });

  it("returns 'X 分鐘前' for minutes ago", () => {
    const d = new Date(REFERENCE - 5 * 60_000);
    const result = formatRelativeFreshness(d, REFERENCE);
    expect(result).toBe("5 分鐘前");
  });

  it("returns 'X 小時前' for hours ago", () => {
    const d = new Date(REFERENCE - 3 * 60 * 60_000);
    const result = formatRelativeFreshness(d, REFERENCE);
    expect(result).toBe("3 小時前");
  });

  it("returns 'X 天前' for days ago", () => {
    const d = new Date(REFERENCE - 3 * 24 * 60 * 60_000);
    const result = formatRelativeFreshness(d, REFERENCE);
    expect(result).toBe("3 天前");
  });

  it("returns a date string for dates older than 30 days", () => {
    const d = new Date(REFERENCE - 40 * 24 * 60 * 60_000); // 40 days before
    const result = formatRelativeFreshness(d, REFERENCE);
    expect(result).toBe("6月1日"); // 2026-06-01 in zh-TW short format
  });

  it("accepts a string date", () => {
    const d = new Date(REFERENCE - 2 * 60 * 60_000);
    const result = formatRelativeFreshness(d.toISOString(), REFERENCE);
    expect(result).toBe("2 小時前");
  });

  it("handles future dates gracefully", () => {
    const future = new Date(REFERENCE + 24 * 60 * 60_000);
    const result = formatRelativeFreshness(future, REFERENCE);
    // Falls back to formatDate for future dates
    expect(result).toBe("2026/7/12");
  });

  it("handles invalid dates", () => {
    expect(formatRelativeFreshness("not-a-date")).toBe("—");
  });

  it("handles null / undefined", () => {
    expect(formatRelativeFreshness(null as unknown as Date)).toBe("—");
    expect(formatRelativeFreshness(undefined as unknown as Date)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// formatCompact
// ---------------------------------------------------------------------------
describe("formatCompact", () => {
  it("formats values under 1000", () => {
    expect(formatCompact(500)).toBe("NT$500");
  });

  it("formats thousands with K suffix", () => {
    expect(formatCompact(352_000)).toBe("NT$352K");
  });

  it("formats values between 10K and 1M", () => {
    expect(formatCompact(48_200)).toBe("NT$48.2K");
  });

  it("formats millions with M suffix", () => {
    expect(formatCompact(4_286_000)).toBe("NT$4.29M");
  });

  it("formats values >= 10M with M suffix", () => {
    expect(formatCompact(12_000_000)).toBe("NT$12.0M");
  });

  it("handles zero", () => {
    expect(formatCompact(0)).toBe("NT$0");
  });

  it("handles negative values", () => {
    expect(formatCompact(-352_000)).toBe("−NT$352K");
  });

  it("handles NaN", () => {
    expect(formatCompact(NaN)).toBe("NT$—");
  });

  it("handles Infinity", () => {
    expect(formatCompact(Infinity)).toBe("NT$—");
    expect(formatCompact(-Infinity)).toBe("NT$—");
  });

  it("handles null / undefined", () => {
    expect(formatCompact(null as unknown as number)).toBe("NT$—");
    expect(formatCompact(undefined as unknown as number)).toBe("NT$—");
  });
});
