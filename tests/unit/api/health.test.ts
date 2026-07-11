/**
 * Tests for GET /api/health
 */

import { describe, expect, it, vi } from "vitest";

// Mock server-only
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

// Must import after mocks
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with status ok and timestamp", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.data.status).toBe("ok");
    expect(body.data.timestamp).toBeTruthy();
    expect(new Date(body.data.timestamp).getTime()).not.toBeNaN();
  });

  it("returns Cache-Control: private, no-store", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not leak internal state", async () => {
    const response = await GET();
    const body = await response.json();
    // No file paths, no error details, no stack traces
    expect(JSON.stringify(body)).not.toContain("/home/");
    expect(JSON.stringify(body)).not.toContain("stack");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
