import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "@/lib/errors";
import { err, ok } from "@/lib/result";

const { mockListNotes, mockReadNote } = vi.hoisted(() => ({
  mockListNotes: vi.fn(),
  mockReadNote: vi.fn(),
}));

vi.mock("@/lib/data/vault-reader", () => ({
  listNotes: mockListNotes,
  readNote: mockReadNote,
}));
vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));
vi.mock("@/lib/config", () => ({
  config: Object.freeze({
    obsidianVaultPath: "/fixture",
    timezone: "Asia/Taipei",
  }),
}));

import { listAllTrades } from "@/lib/data/portfolio-repository";

const tradeFrontmatter = {
  type: "transaction",
  trade_date: "2026-07-13",
  settlement_date: "2026-07-15",
  symbol: "2330.TW",
  name: "台積電",
  side: "sell",
  shares: 5,
  price: 1749,
  gross_amount: 8745,
  fee_tax: 2,
  net_cashflow: 8743,
  status: "confirmed",
};

function note(
  path: string,
  frontmatter: Record<string, unknown> = tradeFrontmatter,
) {
  return ok({ path, frontmatter, content: "# fixture" });
}

describe("portfolio transaction repository integrity", () => {
  beforeEach(() => {
    mockListNotes.mockReset();
    mockReadNote.mockReset();
  });

  it("propagates a safe read error instead of silently dropping a transaction", () => {
    mockListNotes.mockReturnValue(
      ok(["Trading/Portfolio/Transactions/unreadable.md"]),
    );
    mockReadNote.mockReturnValue(
      err(new SourceError("Transaction source is unreadable", "VAULT_READ_FAILED")),
    );

    const result = listAllTrades();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VAULT_READ_FAILED");
    expect(JSON.stringify(result.error)).not.toContain("/fixture/");
  });

  it("fails closed on invalid transaction fields", () => {
    for (const frontmatter of [
      { ...tradeFrontmatter, side: "transfer" },
      { ...tradeFrontmatter, trade_date: "2026-02-30" },
      { ...tradeFrontmatter, settlement_date: "2026-07-15T00:00:00Z" },
      { ...tradeFrontmatter, net_cashflow: undefined },
      { ...tradeFrontmatter, net_cashflow: 0 },
      { ...tradeFrontmatter, net_cashflow: Number.POSITIVE_INFINITY },
      {
        ...tradeFrontmatter,
        trade_date: "2027-07-13",
        net_cashflow: "not-a-number",
      },
    ]) {
      mockListNotes.mockReturnValue(
        ok(["Trading/Portfolio/Transactions/invalid.md"]),
      );
      mockReadNote.mockReturnValue(
        note("Trading/Portfolio/Transactions/invalid.md", frontmatter),
      );

      const result = listAllTrades();

      expect(result.ok, JSON.stringify(frontmatter)).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe("VAULT_INVALID_TRADE");
      expect(result.error.message).toBe("Invalid trade data for 2330.TW");
    }
  });

  it("assigns the same business identity to duplicate notes with different filenames", () => {
    const files = [
      "Trading/Portfolio/Transactions/original.md",
      "Trading/Portfolio/Transactions/copied.md",
    ];
    mockListNotes.mockReturnValue(ok(files));
    mockReadNote.mockImplementation((path: string) => note(path));

    const result = listAllTrades();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    expect(result.value[0].id).toBe(result.value[1].id);
    expect(result.value[0].id).not.toContain("Transactions/");
  });
});
