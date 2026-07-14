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

import {
  loadTradeInsightSources,
  tradeIntegrityDiagnostics,
} from "@/lib/data/portfolio-repository";

const transactionsDir = "Trading/Portfolio/Transactions";

type Entry = { path: string; frontmatter: Record<string, unknown> };

function transaction(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: "transaction",
    trade_date: "2026-07-13",
    settlement_date: "2026-07-15",
    symbol: "2330.TW",
    side: "buy",
    shares: 5,
    price: 1749,
    gross_amount: 8745,
    fee_tax: 2,
    net_cashflow: -8747,
    ...overrides,
  };
}

function arrangeNotes(entries: Entry[]): void {
  mockListNotes.mockReturnValue(ok(entries.map(({ path }) => path)));
  const byPath = new Map(
    entries.map((entry) => [entry.path, entry.frontmatter]),
  );
  mockReadNote.mockImplementation((path: string) =>
    ok({ path, frontmatter: byPath.get(path) ?? {}, content: "# fixture" }),
  );
}

function scan(entries: Entry[]) {
  arrangeNotes(entries);
  const result = tradeIntegrityDiagnostics();
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return result.value;
}

describe("tradeIntegrityDiagnostics", () => {
  beforeEach(() => {
    mockListNotes.mockReset();
    mockReadNote.mockReset();
  });

  it("reports a transaction whose net cashflow is missing", () => {
    const diagnostics = scan([
      {
        path: `${transactionsDir}/private-filename.md`,
        frontmatter: transaction({ net_cashflow: undefined }),
      },
    ]);

    expect(mockListNotes).toHaveBeenCalledWith(transactionsDir);
    expect(diagnostics.missingNetCashflow).toEqual([
      {
        id: expect.stringMatching(/^trade-[0-9a-f]{64}$/),
        symbol: "2330.TW",
      },
    ]);
  });

  it("recognises every current net cashflow alias", () => {
    const diagnostics = scan([
      {
        path: `${transactionsDir}/camel.md`,
        frontmatter: transaction({ net_cashflow: undefined, netCashflow: -1 }),
      },
      {
        path: `${transactionsDir}/kebab.md`,
        frontmatter: transaction({
          net_cashflow: undefined,
          "net-cashflow": "2.5",
        }),
      },
      {
        path: `${transactionsDir}/snake.md`,
        frontmatter: transaction({ net_cashflow: 3 }),
      },
    ]);

    expect(diagnostics.missingNetCashflow).toEqual([]);
  });

  it.each([
    ["missing", undefined],
    ["blank", "   "],
    ["zero", 0],
    ["negative zero", -0],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["nonnumeric", "not-a-number"],
  ])("reports %s net cashflow", (_label, netCashflow) => {
    const diagnostics = scan([
      {
        path: `${transactionsDir}/invalid.md`,
        frontmatter: transaction({
          order_id: "invalid-cashflow-1",
          broker: "test-broker",
          net_cashflow: netCashflow,
        }),
      },
    ]);

    expect(diagnostics.missingNetCashflow).toEqual([
      {
        id: expect.stringMatching(/^trade-[0-9a-f]{64}$/),
        symbol: "2330.TW",
      },
    ]);
  });

  it("does not report valid nonzero numeric cashflows", () => {
    const diagnostics = scan([
      {
        path: `${transactionsDir}/positive.md`,
        frontmatter: transaction({ net_cashflow: 1 }),
      },
      {
        path: `${transactionsDir}/negative-string.md`,
        frontmatter: transaction({ net_cashflow: "-0.01" }),
      },
    ]);

    expect(diagnostics.missingNetCashflow).toEqual([]);
  });

  it("ignores notes that are not transactions", () => {
    const diagnostics = scan([
      {
        path: `${transactionsDir}/position.md`,
        frontmatter: transaction({ type: "position", net_cashflow: undefined }),
      },
      {
        path: `${transactionsDir}/missing-type.md`,
        frontmatter: transaction({ type: undefined, net_cashflow: undefined }),
      },
    ]);

    expect(diagnostics.missingNetCashflow).toEqual([]);
  });

  it("sorts deterministically and deduplicates duplicate business IDs", () => {
    const duplicate = transaction({
      order_id: "ORDER-2",
      broker: "Broker_A",
      net_cashflow: 0,
    });
    const distinct = transaction({
      order_id: "ORDER-1",
      broker: "Broker_A",
      symbol: "0050.tw",
      net_cashflow: "bad",
    });
    const forward: Entry[] = [
      { path: `${transactionsDir}/copy-b.md`, frontmatter: duplicate },
      { path: `${transactionsDir}/distinct.md`, frontmatter: distinct },
      { path: `${transactionsDir}/copy-a.md`, frontmatter: { ...duplicate } },
    ];

    const first = scan(forward);
    const second = scan([...forward].reverse());

    expect(first).toEqual(second);
    expect(first.missingNetCashflow).toHaveLength(2);
    expect(
      first.missingNetCashflow.map((finding) => finding.symbol).sort(),
    ).toEqual(["0050.TW", "2330.TW"]);
    for (const finding of first.missingNetCashflow) {
      expect(finding.id).toMatch(/^trade-[0-9a-f]{64}$/);
    }
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("Broker_A");
    expect(serialized).not.toContain("ORDER-1");
    expect(serialized).not.toContain("ORDER-2");
  });

  it("returns Err when transaction listing fails", () => {
    mockListNotes.mockReturnValue(
      err(new SourceError("Unable to list transactions", "VAULT_LIST_ERROR")),
    );

    const result = tradeIntegrityDiagnostics();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VAULT_LIST_ERROR");
    expect(mockReadNote).not.toHaveBeenCalled();
  });

  it("returns Err when any transaction note cannot be read", () => {
    mockListNotes.mockReturnValue(
      ok([`${transactionsDir}/unreadable-private-name.md`]),
    );
    mockReadNote.mockReturnValue(
      err(new SourceError("Unable to read transaction", "VAULT_READ_ERROR")),
    );

    const result = tradeIntegrityDiagnostics();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VAULT_READ_ERROR");
  });

  it("returns strict trades and diagnostics from one note snapshot", () => {
    arrangeNotes([
      {
        path: `${transactionsDir}/valid.md`,
        frontmatter: transaction({ net_cashflow: -8747 }),
      },
      {
        path: `${transactionsDir}/invalid.md`,
        frontmatter: transaction({ order_id: "invalid-1", net_cashflow: 0 }),
      },
    ]);

    const result = loadTradeInsightSources();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.trades.ok).toBe(false);
    expect(result.value.tradeIntegrity.missingNetCashflow).toHaveLength(1);
    expect(result.value.tradeIntegrity.missingNetCashflow[0]).toEqual({
      id: expect.stringMatching(/^trade-[0-9a-f]{64}$/),
      symbol: "2330.TW",
    });
    expect(mockListNotes).toHaveBeenCalledOnce();
    expect(mockReadNote).toHaveBeenCalledTimes(2);
  });

  it("returns a strict clean trade set when every note is valid", () => {
    arrangeNotes([
      {
        path: `${transactionsDir}/valid.md`,
        frontmatter: transaction({ net_cashflow: -8747 }),
      },
    ]);

    const result = loadTradeInsightSources();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.trades.ok).toBe(true);
    if (!result.value.trades.ok) return;
    expect(result.value.trades.value).toHaveLength(1);
    expect(result.value.tradeIntegrity.missingNetCashflow).toEqual([]);
    expect(mockListNotes).toHaveBeenCalledOnce();
    expect(mockReadNote).toHaveBeenCalledOnce();
  });

  it("uses UNKNOWN for unsafe symbols and never returns raw paths", () => {
    const privatePath = `${transactionsDir}/customer-secret/private-trade.md`;
    const diagnostics = scan([
      {
        path: privatePath,
        frontmatter: transaction({
          symbol: "../../customer-secret/account.md",
          order_id: "../../customer-secret/order",
          broker: "/private/broker",
          net_cashflow: null,
        }),
      },
    ]);

    expect(diagnostics.missingNetCashflow).toHaveLength(1);
    expect(diagnostics.missingNetCashflow[0].symbol).toBe("UNKNOWN");
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain(privatePath);
    expect(serialized).not.toContain("Transactions/");
    expect(serialized).not.toContain("customer-secret");
    expect(serialized).not.toContain("account.md");
    expect(serialized).not.toContain("/private/");
  });
});
