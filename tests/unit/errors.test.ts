import { describe, expect, it } from "vitest";

// Import the errors module — no DOM dependency, safe to import directly
import {
  AppError,
  ConfigError,
  SourceError,
  DataQualityError,
  NotFoundError,
  toSafeResponse,
} from "@/lib/errors";

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

describe("error hierarchy", () => {
  it("AppError is instance of Error", () => {
    const e = new AppError("msg", "CODE");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AppError);
  });

  it("subclasses are instances of AppError", () => {
    const ce = new ConfigError("bad config");
    const se = new SourceError("source fail");
    const de = new DataQualityError("dirty data");
    const ne = new NotFoundError("missing");

    expect(ce).toBeInstanceOf(AppError);
    expect(ce).toBeInstanceOf(ConfigError);
    expect(se).toBeInstanceOf(AppError);
    expect(se).toBeInstanceOf(SourceError);
    expect(de).toBeInstanceOf(AppError);
    expect(de).toBeInstanceOf(DataQualityError);
    expect(ne).toBeInstanceOf(AppError);
    expect(ne).toBeInstanceOf(NotFoundError);
  });

  it("each carries message, code, and optional cause", () => {
    const cause = new Error("underlying");
    const e = new AppError("safe message", "CUSTOM", cause);

    expect(e.message).toBe("safe message");
    expect(e.code).toBe("CUSTOM");
    expect(e.cause).toBe(cause);
  });

  it("subclasses have sensible default codes", () => {
    expect(new ConfigError("msg").code).toBe("CONFIG_ERROR");
    expect(new SourceError("msg").code).toBe("SOURCE_ERROR");
    expect(new DataQualityError("msg").code).toBe("DATA_QUALITY");
    expect(new NotFoundError("msg").code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// toSafeResponse
// ---------------------------------------------------------------------------

describe("toSafeResponse", () => {
  it("returns safe message and code for AppError", () => {
    const e = new AppError("user-friendly", "VALIDATION", { path: "/secret" });
    const resp = toSafeResponse(e);
    expect(resp).toEqual({ message: "user-friendly", code: "VALIDATION" });
    // The cause (with path) is NOT in the response
    expect(resp).not.toHaveProperty("cause");
  });

  it("returns generic message for unknown errors", () => {
    const resp = toSafeResponse(new Error("raw internal detail"));
    expect(resp).toEqual({
      message: "Internal Server Error",
      code: "INTERNAL_ERROR",
    });
  });

  it("returns generic message for non-Error throws", () => {
    const resp = toSafeResponse("just a string");
    expect(resp).toEqual({
      message: "Internal Server Error",
      code: "INTERNAL_ERROR",
    });
  });

  it("works with subclasses", () => {
    expect(toSafeResponse(new NotFoundError("record missing"))).toEqual({
      message: "record missing",
      code: "NOT_FOUND",
    });
  });
});
