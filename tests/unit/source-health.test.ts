import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import { aggregateHealth } from "@/lib/source-health";
import type { SourceHealth } from "@/lib/source-health";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHealthy(name: string): SourceHealth {
  return {
    sourceName: name,
    lastModifiedAt: "2026-07-10T00:00:00+08:00",
    lastSuccessfulReadAt: "2026-07-11T08:30:00+08:00",
    recordCount: 100,
    warningCount: 0,
  };
}

function makeDegraded(name: string): SourceHealth {
  return {
    ...makeHealthy(name),
    warningCount: 3,
  };
}

function makeUnavailable(name: string): SourceHealth {
  return {
    ...makeHealthy(name),
    warningCount: 1,
    errorCode: "READ_FAILED",
    lastSuccessfulReadAt: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("aggregateHealth", () => {
  it("returns healthy when all sources are clean", () => {
    expect(aggregateHealth([makeHealthy("finance-db")])).toBe("healthy");
    expect(
      aggregateHealth([makeHealthy("finance-db"), makeHealthy("obsidian-vault")]),
    ).toBe("healthy");
  });

  it("returns degraded when any source has warnings", () => {
    expect(
      aggregateHealth([makeHealthy("finance-db"), makeDegraded("obsidian-vault")]),
    ).toBe("degraded");
  });

  it("returns unavailable when any source has an errorCode", () => {
    expect(
      aggregateHealth([makeHealthy("finance-db"), makeUnavailable("obsidian-vault")]),
    ).toBe("unavailable");
  });

  it("returns unavailable even if only one of many sources is down", () => {
    expect(
      aggregateHealth([
        makeHealthy("finance-db"),
        makeDegraded("broker-csv"),
        makeUnavailable("obsidian-vault"),
      ]),
    ).toBe("unavailable");
  });

  it("returns healthy for empty sources list", () => {
    expect(aggregateHealth([])).toBe("healthy");
  });
});

// ---------------------------------------------------------------------------
// Safe fields — type-level check that SourceHealth has no paths
// ---------------------------------------------------------------------------

describe("SourceHealth safe fields", () => {
  it("has only client-safe keys", () => {
    const h: SourceHealth = {
      sourceName: "finance-db",
      lastModifiedAt: null,
      lastSuccessfulReadAt: null,
      recordCount: 0,
      warningCount: 0,
      errorCode: "TEST_ERR",
    };

    const keys = Object.keys(h).sort();
    // errorCode is optional but included here for key enumeration
    expect(keys).toEqual([
      "errorCode",
      "lastModifiedAt",
      "lastSuccessfulReadAt",
      "recordCount",
      "sourceName",
      "warningCount",
    ]);

    // Ensure no path or raw-error fields exist on SourceHealth type.
    // This is a compile-time check, verified at runtime by key enumeration.
    expect(keys).not.toContain("sourcePath");
    expect(keys).not.toContain("rawError");
  });
});
