import { describe, expect, it } from "vitest";
import { ok, err, unwrapOr, unwrap, map, mapErr, andThen } from "@/lib/result";

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------
describe("ok / err constructors", () => {
  it("ok() returns { ok: true, value }", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("err() returns { ok: false, error }", () => {
    const result = err("something went wrong");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("something went wrong");
    }
  });
});

// ---------------------------------------------------------------------------
// unwrap
// ---------------------------------------------------------------------------
describe("unwrap", () => {
  it("returns the value for Ok", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("throws the error for Err", () => {
    expect(() => unwrap(err(new Error("boom")))).toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// unwrapOr
// ---------------------------------------------------------------------------
describe("unwrapOr", () => {
  it("returns the value for Ok", () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it("returns the fallback for Err", () => {
    expect(unwrapOr(err("fail"), 99)).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// map
// ---------------------------------------------------------------------------
describe("map", () => {
  it("applies fn to Ok value", () => {
    const result = map(ok(2), (n) => n * 10);
    expect(unwrap(result)).toBe(20);
  });

  it("passes Err through unchanged", () => {
    const e = err("fail");
    const result = map(e, (n: number) => n * 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// mapErr
// ---------------------------------------------------------------------------
describe("mapErr", () => {
  it("passes Ok through unchanged", () => {
    const result = mapErr(ok(42), (e: string) => new Error(e));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("applies fn to Err error", () => {
    const result = mapErr(err("low"), (e) => `HIGH-${e}`);
    if (!result.ok) expect(result.error).toBe("HIGH-low");
  });
});

// ---------------------------------------------------------------------------
// andThen
// ---------------------------------------------------------------------------
describe("andThen", () => {
  it("chains Ok into another Ok", () => {
    const result = andThen(ok(5), (n) => ok(n * 2));
    expect(unwrap(result)).toBe(10);
  });

  it("chains Ok into an Err (short-circuit)", () => {
    const result = andThen(ok(5), () => err("bail"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("bail");
  });

  it("short-circuits on initial Err", () => {
    const result = andThen(err("initial"), () => ok(999));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("initial");
  });
});

// ---------------------------------------------------------------------------
// Chaining
// ---------------------------------------------------------------------------
describe("chaining multiple operations", () => {
  function parseAndDouble(input: string) {
    const n = parseFloat(input);
    if (Number.isNaN(n)) return err("not a number" as const);
    return ok(n * 2);
  }

  function ensurePositive(n: number) {
    if (n <= 0) return err("must be positive" as const);
    return ok(n);
  }

  it("chains two Ok operations", () => {
    const result = andThen(parseAndDouble("3"), ensurePositive);
    expect(unwrap(result)).toBe(6);
  });

  it("short-circuits on first error", () => {
    const result = andThen(parseAndDouble("abc"), ensurePositive);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not a number");
  });

  it("short-circuits on second error", () => {
    const result = andThen(parseAndDouble("-1"), ensurePositive);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("must be positive");
  });
});
