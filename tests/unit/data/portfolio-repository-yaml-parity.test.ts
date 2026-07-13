import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => {
  const vaultPath = __dirname + "/../../fixtures/yaml-parity-vault";
  return {
    config: Object.freeze({
      obsidianVaultPath: vaultPath,
      vaultRoot: vaultPath,
    }),
  };
});
vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));

import { readNote } from "@/lib/data/vault-reader";
import { parseTrade } from "@/lib/data/portfolio-repository";

const directory = "Trading/Portfolio/Transactions";

function readAndParse(filename: string) {
  const note = readNote(`${directory}/${filename}`);
  expect(note.ok).toBe(true);
  if (!note.ok) return note;
  return parseTrade(note.value);
}

describe("portfolio raw YAML transaction parity", () => {
  it.each(["impossible-date.md", "timestamp-date.md"])(
    "rejects parser-coerced non-date-only input from %s",
    (filename) => {
      const result = readAndParse(filename);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VAULT_INVALID_TRADE");
    },
  );

  it("skips an empty higher-priority cashflow alias", () => {
    const result = readAndParse("empty-alias.md");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.netCashflow).toBe(8_743);
  });

  it("rejects display-formatted cashflow strings", () => {
    const result = readAndParse("formatted-cashflow.md");
    expect(result.ok).toBe(false);
  });

  it("canonicalizes integer and decimal YAML spellings to one identity", () => {
    const integer = readAndParse("numeric-int.md");
    const decimal = readAndParse("numeric-decimal.md");
    expect(integer.ok).toBe(true);
    expect(decimal.ok).toBe(true);
    if (!integer.ok || !decimal.ok) return;
    expect(integer.value.id).toBe(decimal.value.id);
  });

  it("keeps missing optional numeric fields distinct from explicit zero", () => {
    const zero = readAndParse("numeric-int.md");
    const missing = readAndParse("numeric-missing-fee.md");
    expect(zero.ok).toBe(true);
    expect(missing.ok).toBe(true);
    if (!zero.ok || !missing.ok) return;
    expect(zero.value.id).not.toBe(missing.value.id);
  });

  it("falls through an empty primary order ID alias", () => {
    const result = readAndParse("order-alias.md");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("order:cathay securities:secondary-order");
  });
});
