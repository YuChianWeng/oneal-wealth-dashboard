"use server";

/**
 * Zod schemas for finance view models.
 *
 * These describe **only** what the API returns — never raw source data shapes.
 * All amounts are numbers; all dates are ISO-8601 strings.
 * Uses .strict() to reject extra fields (prevents accidental field leakage).
 */

import { z } from "zod";
import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const amount = () => z.number().finite();
const dateStr = () =>
  z.string().datetime({ offset: true }).or(z.string().date());

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------

export const CategoryBreakdownSchema = z
  .object({
    category: z.string().min(1),
    amount: amount(),
  })
  .strict();

export type CategoryBreakdown = z.infer<typeof CategoryBreakdownSchema>;

// ---------------------------------------------------------------------------
// Account breakdown
// ---------------------------------------------------------------------------

export const AccountBreakdownSchema = z
  .object({
    account: z.string().min(1),
    amount: amount(),
  })
  .strict();

export type AccountBreakdown = z.infer<typeof AccountBreakdownSchema>;

// ---------------------------------------------------------------------------
// Monthly summary
// ---------------------------------------------------------------------------

export const MonthlySummarySchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
    totalIncome: amount(),
    totalExpense: amount(),
    netCashflow: amount(),
    categoryBreakdown: z.array(CategoryBreakdownSchema),
    accountBreakdown: z.array(AccountBreakdownSchema),
  })
  .strict();

export type MonthlySummary = z.infer<typeof MonthlySummarySchema>;

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

export const TransactionRowSchema = z
  .object({
    id: z.number().int().positive(),
    date: dateStr(),
    item: z.string().min(1),
    amount: amount(),
    account: z.string().min(1),
    category: z.string().min(1),
    type: z.enum([
      "expense",
      "income",
      "investment_settlement",
      "loan_interest_payment",
      "loan_principal_repayment",
    ]),
    currency: z.string().length(3),
    merchant: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

export type TransactionRow = z.infer<typeof TransactionRowSchema>;

// ---------------------------------------------------------------------------
// Account info
// ---------------------------------------------------------------------------

export const AccountInfoSchema = z
  .object({
    name: z.string().min(1),
    balance: amount(),
    type: z.string().min(1),
  })
  .strict();

export type AccountInfo = z.infer<typeof AccountInfoSchema>;

// ---------------------------------------------------------------------------
// Loan info
// ---------------------------------------------------------------------------

export const LoanInfoSchema = z
  .object({
    name: z.string().min(1),
    principal: amount(),
    interest: amount(),
    remainingBalance: amount(),
  })
  .strict();

export type LoanInfo = z.infer<typeof LoanInfoSchema>;

// ---------------------------------------------------------------------------
// Balance snapshot
// ---------------------------------------------------------------------------

export const BalanceSnapshotSchema = z
  .object({
    date: dateStr(),
    totalAssets: amount(),
    totalLiabilities: amount(),
    netWorth: amount(),
  })
  .strict();

export type BalanceSnapshot = z.infer<typeof BalanceSnapshotSchema>;
