import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";

// ---------------------------------------------------------------------------
// Path to the sanitized test fixture database.
// vi.hoisted ensures it's available in mock factories during hoisting.
// We use a simple string — no imports needed inside hoisted().
// ---------------------------------------------------------------------------
const { FIXTURE_DB_PATH } = vi.hoisted(() => {
  // Compute the absolute path using __dirname (available in vitest via transform)
  // __dirname is the directory of this test file when run by vitest
  const testDir = __dirname;
  const fixturePath = testDir + "/../../../lib/data/__fixtures__/finance.db";
  return { FIXTURE_DB_PATH: fixturePath };
});

// ---------------------------------------------------------------------------
// Mock server-only guard (must be before any module imports)
// ---------------------------------------------------------------------------
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock config to point at the fixture DB (bypasses path validation)
// ---------------------------------------------------------------------------
vi.mock("@/lib/config", () => {
  const frozenConfig = Object.freeze({
    financeDbPath: FIXTURE_DB_PATH,
    obsidianVaultPath: "/tmp/test-vault",
    timezone: "Asia/Taipei",
    origin: "http://localhost:3000",
    port: 3000,
    vaultRoot: "/home/ubuntu/ObsidianVault",
    dataRoot: "/home/ubuntu/data/finance",
    warnings: Object.freeze([] as string[]),
  });
  return { config: frozenConfig };
});

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------
import {
  monthlySummary,
  categoryBreakdown,
  accountBreakdown,
  transactionsPage,
  balanceSnapshots,
  accountsList,
  loansSummary,
} from "@/lib/data/finance-repository";
import { getDb, closeDb } from "@/lib/data/finance-db";

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
beforeAll(() => {
  // Trigger DB singleton creation with our mocked config
  getDb();
});

afterAll(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// monthlySummary
// ---------------------------------------------------------------------------
describe("monthlySummary", () => {
  it("returns Ok with MonthlySummary for June 2026", () => {
    const result = monthlySummary("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const summary = result.value;
    expect(summary.month).toBe("2026-06");
    expect(summary.totalIncome).toBeGreaterThan(0);
    expect(summary.totalExpense).toBeGreaterThan(0);
    expect(summary.netCashflow).toBe(
      summary.totalIncome - summary.totalExpense,
    );
    // Category breakdown should have expense-only items
    expect(summary.categoryBreakdown.length).toBeGreaterThan(0);
    // Account breakdown should have expense-only items
    expect(summary.accountBreakdown.length).toBeGreaterThan(0);
  });

  it("excludes investment-bucket transactions from totals", () => {
    const result = monthlySummary("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const summary = result.value;
    // The investment settlement (10000 TWD) should NOT appear in account breakdown
    const invAccounts = summary.accountBreakdown.filter(
      (a) => a.account === "Test Brokerage",
    );
    expect(invAccounts).toHaveLength(0);

    // Investment category should NOT appear in category breakdown
    const invCats = summary.categoryBreakdown.filter(
      (c) => c.category === "Investments",
    );
    expect(invCats).toHaveLength(0);
  });

  it("computes netCashflow correctly", () => {
    const result = monthlySummary("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const summary = result.value;
    // June: income = 50000 + 5000 = 55000
    expect(summary.netCashflow).toBeGreaterThan(0);
  });

  it("returns Ok with zero totals for month with no data", () => {
    const result = monthlySummary("2020-01");
    // The query returns zeros via COALESCE, so this is Ok with empty data
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.totalIncome).toBe(0);
    expect(result.value.totalExpense).toBe(0);
    expect(result.value.netCashflow).toBe(0);
    expect(result.value.categoryBreakdown).toEqual([]);
    expect(result.value.accountBreakdown).toEqual([]);
  });

  it("handles invalid month format gracefully", () => {
    const result = monthlySummary("not-a-month");
    // The query will find no data (strftime returns NULL), so it returns Err
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// categoryBreakdown
// ---------------------------------------------------------------------------
describe("categoryBreakdown", () => {
  it("returns Ok with categories sorted by amount DESC", () => {
    const result = categoryBreakdown("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const items = result.value;
    expect(items.length).toBeGreaterThan(0);

    // First item should have the highest amount
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].amount).toBeGreaterThanOrEqual(items[i].amount);
    }
  });

  it("each item has category (string) and amount (finite number)", () => {
    const result = categoryBreakdown("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const item of result.value) {
      expect(typeof item.category).toBe("string");
      expect(item.category.length).toBeGreaterThan(0);
      expect(Number.isFinite(item.amount)).toBe(true);
    }
  });

  it("returns empty array for month with no data (still Ok)", () => {
    const result = categoryBreakdown("2020-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// accountBreakdown
// ---------------------------------------------------------------------------
describe("accountBreakdown", () => {
  it("returns Ok with accounts sorted by amount DESC", () => {
    const result = accountBreakdown("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const items = result.value;
    expect(items.length).toBeGreaterThan(0);

    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].amount).toBeGreaterThanOrEqual(items[i].amount);
    }
  });

  it("excludes investment-bucket accounts", () => {
    const result = accountBreakdown("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const invAccount = result.value.find((a) => a.account === "Test Brokerage");
    expect(invAccount).toBeUndefined();
  });

  it("each item has account (string) and amount (finite)", () => {
    const result = accountBreakdown("2026-06");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const item of result.value) {
      expect(typeof item.account).toBe("string");
      expect(item.account.length).toBeGreaterThan(0);
      expect(Number.isFinite(item.amount)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// transactionsPage
// ---------------------------------------------------------------------------
describe("transactionsPage", () => {
  it("returns paginated transactions for June 2026", () => {
    const result = transactionsPage("2026-06", 1, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const page = result.value;
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(5);
    expect(page.rows.length).toBeLessThanOrEqual(5);
    expect(page.total).toBeGreaterThan(0);
  });

  it("returns correct pagination metadata", () => {
    const result = transactionsPage("2026-06", 1, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const page = result.value;
    expect(page.total).toBe(11); // 11 non-investment June transactions
    expect(page.rows.length).toBe(3);
  });

  it("second page returns different rows", () => {
    const page1 = transactionsPage("2026-06", 1, 3);
    const page2 = transactionsPage("2026-06", 2, 3);

    expect(page1.ok).toBe(true);
    expect(page2.ok).toBe(true);
    if (!page1.ok || !page2.ok) throw new Error("expected Ok");

    const ids1 = page1.value.rows.map((r) => r.id);
    const ids2 = page2.value.rows.map((r) => r.id);
    // No overlap
    const overlap = ids1.filter((id) => ids2.includes(id));
    expect(overlap).toHaveLength(0);

    // Page 2 should have different data
    expect(ids2.length).toBeGreaterThan(0);
  });

  it("excludes investment-bucket transactions", () => {
    const result = transactionsPage("2026-06", 1, 20);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    // None of the transactions should be from investment accounts
    const invTxns = result.value.rows.filter(
      (t) => t.account === "Test Brokerage" || t.account === "Test Crypto",
    );
    expect(invTxns).toHaveLength(0);
  });

  it("each transaction row has required fields", () => {
    const result = transactionsPage("2026-06", 1, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const txn of result.value.rows) {
      expect(txn.id).toBeGreaterThan(0);
      expect(typeof txn.date).toBe("string");
      expect(txn.item.length).toBeGreaterThan(0);
      expect(Number.isFinite(txn.amount)).toBe(true);
      expect(typeof txn.account).toBe("string");
      expect(typeof txn.category).toBe("string");
      expect([
        "expense",
        "income",
        "investment_settlement",
        "loan_interest_payment",
        "loan_principal_repayment",
      ]).toContain(txn.type);
      expect(txn.currency).toHaveLength(3);
    }
  });

  it("returns empty rows for month with no data", () => {
    const result = transactionsPage("2020-01", 1, 10);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.rows).toEqual([]);
    expect(result.value.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// balanceSnapshots
// ---------------------------------------------------------------------------
describe("balanceSnapshots", () => {
  it("returns time series for CHK001 since 2026-06-01", () => {
    const result = balanceSnapshots("CHK001", "2026-06-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const snapshots = result.value;
    expect(snapshots.length).toBe(3);

    // Ordered by date ascending
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i - 1].date <= snapshots[i].date).toBe(true);
    }
  });

  it("each snapshot has date, totalAssets, totalLiabilities, netWorth", () => {
    const result = balanceSnapshots("CHK001", "2026-06-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const snap of result.value) {
      expect(typeof snap.date).toBe("string");
      expect(Number.isFinite(snap.totalAssets)).toBe(true);
      expect(Number.isFinite(snap.totalLiabilities)).toBe(true);
      expect(Number.isFinite(snap.netWorth)).toBe(true);
    }
  });

  it("positive balance maps to totalAssets", () => {
    const result = balanceSnapshots("CHK001", "2026-06-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const snap of result.value) {
      expect(snap.totalAssets).toBeGreaterThan(0);
      expect(snap.totalLiabilities).toBe(0);
      expect(snap.netWorth).toBeGreaterThan(0);
    }
  });

  it("negative balance maps to totalLiabilities", () => {
    const result = balanceSnapshots("LOAN001", "2026-06-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const snap = result.value[0];
    expect(snap.totalLiabilities).toBeGreaterThan(0);
    expect(snap.totalAssets).toBe(0);
    expect(snap.netWorth).toBeLessThan(0);
  });

  it("filters by since date", () => {
    const result = balanceSnapshots("CHK001", "2026-07-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    expect(result.value.length).toBe(1);
    expect(result.value[0].date).toBe("2026-07-01");
  });

  it("returns empty array for unknown account", () => {
    const result = balanceSnapshots("NONEXISTENT", "2026-01-01");
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// accountsList
// ---------------------------------------------------------------------------
describe("accountsList", () => {
  it("returns all active accounts", () => {
    const result = accountsList();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const accounts = result.value;
    // 6 active accounts (INACTIVE is excluded)
    expect(accounts.length).toBe(6);

    // Verify INACTIVE is not present
    const inactive = accounts.find((a) => a.name === "Inactive Account");
    expect(inactive).toBeUndefined();
  });

  it("each account has name, balance, type", () => {
    const result = accountsList();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const acct of result.value) {
      expect(typeof acct.name).toBe("string");
      expect(acct.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(acct.balance)).toBe(true);
      expect(typeof acct.type).toBe("string");
    }
  });

  it("accounts with snapshots have non-zero balance", () => {
    const result = accountsList();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const chk = result.value.find((a) => a.name === "Test Checking");
    expect(chk).toBeDefined();
    if (chk) {
      expect(chk.balance).toBe(52300); // latest snapshot
    }
  });
});

// ---------------------------------------------------------------------------
// loansSummary
// ---------------------------------------------------------------------------
describe("loansSummary", () => {
  it("returns active loans with computed interest", () => {
    const result = loansSummary();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    const loans = result.value;
    expect(loans.length).toBe(1);

    const loan = loans[0];
    expect(loan.name).toBe("Test Personal Loan");
    expect(loan.principal).toBe(200000);
    expect(loan.remainingBalance).toBe(200000);
    // Monthly interest: 200000 * 0.0375 / 12 = 625
    expect(loan.interest).toBe(625);
  });

  it("each loan has name, principal, interest, remainingBalance", () => {
    const result = loansSummary();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;

    for (const loan of result.value) {
      expect(typeof loan.name).toBe("string");
      expect(loan.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(loan.principal)).toBe(true);
      expect(Number.isFinite(loan.interest)).toBe(true);
      expect(Number.isFinite(loan.remainingBalance)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Read-only enforcement
// ---------------------------------------------------------------------------
describe("read-only enforcement", () => {
  it("database is opened in readonly mode", () => {
    const db = getDb();
    // better-sqlite3 readonly databases cannot run INSERT/UPDATE/DELETE/CREATE
    expect(() =>
      db
        .prepare("INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)")
        .run("test", "test", "2026-01-01"),
    ).toThrow(/readonly/);
  });
});
