import { describe, expect, it } from "vitest";
import { getDashboardStatus } from "@/lib/dashboard-copy";

describe("getDashboardStatus", () => {
  it("declares the dashboard's read-only data boundary", () => {
    expect(getDashboardStatus()).toEqual({
      heading: "Oneal Wealth Dashboard",
      detail: "Read-only v1 · no financial records are changed.",
    });
  });
});
