/**
 * Tests for net-worth.ts — net worth from balance snapshots.
 */

import { describe, expect, it } from "vitest";
import {
  computeNetWorth,
  latestNetWorth,
  isCoverageSufficient,
} from "@/lib/analytics/net-worth";
import type { BalanceSnapshot } from "@/lib/schemas/finance";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fullCoverageSnapshots: BalanceSnapshot[] = [
  {
    date: "2026-06-01",
    totalAssets: 1_000_000,
    totalLiabilities: 200_000,
    netWorth: 800_000,
  },
  {
    date: "2026-06-15",
    totalAssets: 1_050_000,
    totalLiabilities: 190_000,
    netWorth: 860_000,
  },
  {
    date: "2026-07-01",
    totalAssets: 1_100_000,
    totalLiabilities: 180_000,
    netWorth: 920_000,
  },
];

const partialCoverageSnapshots: BalanceSnapshot[] = [
  {
    date: "2026-06-01",
    totalAssets: 800_000,
    totalLiabilities: 150_000,
    netWorth: 650_000,
  },
];

// ---------------------------------------------------------------------------
// computeNetWorth
// ---------------------------------------------------------------------------

describe("computeNetWorth", () => {
  it("returns null for empty snapshots", () => {
    const result = computeNetWorth([], 5, 0);
    expect(result).toBeNull();
  });

  it("returns null when coveredAccounts is 0", () => {
    const result = computeNetWorth(fullCoverageSnapshots, 5, 0);
    expect(result).toBeNull();
  });

  it("returns sorted points by date", () => {
    const unsorted: BalanceSnapshot[] = [
      {
        date: "2026-07-01",
        totalAssets: 1_100_000,
        totalLiabilities: 180_000,
        netWorth: 920_000,
      },
      {
        date: "2026-06-01",
        totalAssets: 1_000_000,
        totalLiabilities: 200_000,
        netWorth: 800_000,
      },
    ];

    const result = computeNetWorth(unsorted, 5, 5);
    expect(result).not.toBeNull();
    expect(result!.points).toHaveLength(2);
    expect(result!.points[0].date).toBe("2026-06-01");
    expect(result!.points[1].date).toBe("2026-07-01");
  });

  it("returns correct net worth values", () => {
    const result = computeNetWorth(fullCoverageSnapshots, 5, 5);
    expect(result).not.toBeNull();
    expect(result!.points).toHaveLength(3);
    expect(result!.points[0].netWorth).toBe(800_000);
    expect(result!.points[2].netWorth).toBe(920_000);
  });

  it("has null coverageLabel when fully covered", () => {
    const result = computeNetWorth(fullCoverageSnapshots, 5, 5);
    expect(result).not.toBeNull();
    expect(result!.coverageLabel).toBeNull();
  });

  it("shows coverage label when incomplete", () => {
    const result = computeNetWorth(partialCoverageSnapshots, 5, 3);
    expect(result).not.toBeNull();
    expect(result!.coverageLabel).toBe("3 of 5 accounts available");
  });

  it("reports correct total and covered account counts", () => {
    const result = computeNetWorth(fullCoverageSnapshots, 8, 6);
    expect(result).not.toBeNull();
    expect(result!.totalAccounts).toBe(8);
    expect(result!.coveredAccounts).toBe(6);
    expect(result!.coverageLabel).toBe("6 of 8 accounts available");
  });

  it("handles single snapshot", () => {
    const result = computeNetWorth(
      [
        {
          date: "2026-07-01",
          totalAssets: 500_000,
          totalLiabilities: 100_000,
          netWorth: 400_000,
        },
      ],
      1,
      1,
    );
    expect(result).not.toBeNull();
    expect(result!.points).toHaveLength(1);
    expect(result!.coverageLabel).toBeNull();
  });

  it("handles zero-value snapshot", () => {
    const result = computeNetWorth(
      [
        {
          date: "2026-07-01",
          totalAssets: 0,
          totalLiabilities: 0,
          netWorth: 0,
        },
      ],
      3,
      1,
    );
    expect(result).not.toBeNull();
    expect(result!.points[0].netWorth).toBe(0);
    expect(result!.coverageLabel).toBe("1 of 3 accounts available");
  });
});

// ---------------------------------------------------------------------------
// latestNetWorth
// ---------------------------------------------------------------------------

describe("latestNetWorth", () => {
  it("returns the last point's net worth", () => {
    const series = computeNetWorth(fullCoverageSnapshots, 5, 5);
    expect(latestNetWorth(series)).toBe(920_000);
  });

  it("returns null for null series", () => {
    expect(latestNetWorth(null)).toBeNull();
  });

  it("returns null for series with no points", () => {
    expect(
      latestNetWorth({
        points: [],
        coverageLabel: null,
        totalAccounts: 0,
        coveredAccounts: 0,
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isCoverageSufficient
// ---------------------------------------------------------------------------

describe("isCoverageSufficient", () => {
  it("returns true when at least one account is covered", () => {
    const series = computeNetWorth(fullCoverageSnapshots, 5, 3);
    expect(isCoverageSufficient(series)).toBe(true);
  });

  it("returns false for null series", () => {
    expect(isCoverageSufficient(null)).toBe(false);
  });

  it("returns false for series with zero covered", () => {
    // We can't actually create such a series via computeNetWorth (it guards),
    // but test the function directly with a constructed object.
    expect(
      isCoverageSufficient({
        points: [],
        coverageLabel: "0 of 5 accounts available",
        totalAccounts: 5,
        coveredAccounts: 0,
      }),
    ).toBe(false);
  });
});
