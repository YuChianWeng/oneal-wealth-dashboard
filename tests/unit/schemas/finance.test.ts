import { describe, expect, it, vi } from "vitest";

// Mock server-only guard
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

import {
  CategoryBreakdownSchema,
  AccountBreakdownSchema,
  MonthlySummarySchema,
  TransactionRowSchema,
  AccountInfoSchema,
  LoanInfoSchema,
  BalanceSnapshotSchema,
} from "@/lib/schemas/finance";

// ---------------------------------------------------------------------------
// CategoryBreakdown
// ---------------------------------------------------------------------------
describe("CategoryBreakdownSchema", () => {
  const valid = { category: "Food", amount: 1500.5 };

  it("accepts valid data", () => {
    expect(CategoryBreakdownSchema.parse(valid)).toEqual(valid);
  });

  it("accepts zero amount", () => {
    expect(CategoryBreakdownSchema.parse({ category: "Food", amount: 0 })).toEqual({
      category: "Food",
      amount: 0,
    });
  });

  it("rejects non-finite amount", () => {
    expect(() =>
      CategoryBreakdownSchema.parse({ category: "Food", amount: NaN }),
    ).toThrow();
  });

  it("rejects missing category", () => {
    expect(() => CategoryBreakdownSchema.parse({ amount: 100 })).toThrow();
  });

  it("rejects extra fields (strict mode)", () => {
    expect(() =>
      CategoryBreakdownSchema.parse({ category: "Food", amount: 100, secret: "leak" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AccountBreakdown
// ---------------------------------------------------------------------------
describe("AccountBreakdownSchema", () => {
  it("accepts valid data", () => {
    const data = { account: "Checking", amount: 50000 };
    expect(AccountBreakdownSchema.parse(data)).toEqual(data);
  });

  it("rejects extra fields", () => {
    expect(() =>
      AccountBreakdownSchema.parse({ account: "Savings", amount: 10000, path: "/secret" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// MonthlySummary
// ---------------------------------------------------------------------------
describe("MonthlySummarySchema", () => {
  const valid = {
    month: "2026-07",
    totalIncome: 120000,
    totalExpense: 85000,
    netCashflow: 35000,
    categoryBreakdown: [{ category: "Food", amount: 15000 }],
    accountBreakdown: [{ account: "Checking", amount: 35000 }],
  };

  it("accepts valid monthly summary", () => {
    expect(MonthlySummarySchema.parse(valid)).toEqual(valid);
  });

  it("rejects bad month format", () => {
    expect(() =>
      MonthlySummarySchema.parse({ ...valid, month: "July-2026" }),
    ).toThrow();
  });

  it("rejects missing array fields", () => {
    expect(() =>
      MonthlySummarySchema.parse({
        month: "2026-07",
        totalIncome: 100,
        totalExpense: 50,
        netCashflow: 50,
      }),
    ).toThrow();
  });

  it("rejects extra top-level field", () => {
    expect(() =>
      MonthlySummarySchema.parse({ ...valid, rawQuery: "SELECT *" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TransactionRow
// ---------------------------------------------------------------------------
describe("TransactionRowSchema", () => {
  const valid = {
    id: 1,
    date: "2026-07-11",
    item: "Lunch",
    amount: 250,
    account: "Cash",
    category: "Food",
    type: "expense" as const,
    currency: "TWD",
  };

  it("accepts valid transaction row", () => {
    expect(TransactionRowSchema.parse(valid)).toEqual(valid);
  });

  it("accepts optional fields", () => {
    const withOpt = {
      ...valid,
      merchant: "7-Eleven",
      note: "quick bite",
    };
    expect(TransactionRowSchema.parse(withOpt)).toEqual(withOpt);
  });

  it("rejects non-positive id", () => {
    expect(() =>
      TransactionRowSchema.parse({ ...valid, id: 0 }),
    ).toThrow();
  });

  it("rejects invalid type enum", () => {
    expect(() =>
      TransactionRowSchema.parse({ ...valid, type: "refund" }),
    ).toThrow();
  });

  it("rejects wrong currency length", () => {
    expect(() =>
      TransactionRowSchema.parse({ ...valid, currency: "NT" }),
    ).toThrow();
  });

  it("rejects extra fields", () => {
    expect(() =>
      TransactionRowSchema.parse({ ...valid, internalId: "abc-123" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AccountInfo
// ---------------------------------------------------------------------------
describe("AccountInfoSchema", () => {
  it("accepts valid data", () => {
    const data = { name: "Checking", balance: 100000, type: "bank" };
    expect(AccountInfoSchema.parse(data)).toEqual(data);
  });

  it("rejects extra fields", () => {
    expect(() =>
      AccountInfoSchema.parse({ name: "Checking", balance: 100000, type: "bank", iban: "xxx" }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// LoanInfo
// ---------------------------------------------------------------------------
describe("LoanInfoSchema", () => {
  it("accepts valid data", () => {
    const data = { name: "Mortgage", principal: 5_000_000, interest: 12000, remainingBalance: 4_500_000 };
    expect(LoanInfoSchema.parse(data)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// BalanceSnapshot
// ---------------------------------------------------------------------------
describe("BalanceSnapshotSchema", () => {
  it("accepts valid data", () => {
    const data = {
      date: "2026-07-01",
      totalAssets: 10_000_000,
      totalLiabilities: 4_500_000,
      netWorth: 5_500_000,
    };
    expect(BalanceSnapshotSchema.parse(data)).toEqual(data);
  });
});
