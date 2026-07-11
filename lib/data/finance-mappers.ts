/**
 * Row → view-model mappers for the Finance data layer.
 *
 * Each mapper converts a raw DB row (snake_case columns) into a
 * type-safe view-model shape (camelCase fields) suitable for client
 * consumption. All mappers are pure functions — no side effects,
 * no DB access, no throws.
 *
 * SQLite stores booleans as integers (0 / 1) and all numbers as
 * JavaScript numbers; these mappers handle that coercion safely.
 */

import "server-only";

import { assertServerOnly } from "@/lib/server-only";
import type {
  MonthlySummary,
  CategoryBreakdown,
  AccountBreakdown,
  TransactionRow,
  AccountInfo,
  LoanInfo,
  BalanceSnapshot,
} from "@/lib/schemas/finance";
import type {
  RawMonthlyTotalsRow,
  RawCategoryRow,
  RawAccountRow,
  RawTransactionRow,
  RawAccountRow_full,
  RawLoanRow,
  RawBalanceSnapshotRow,
} from "./finance-queries";

assertServerOnly();

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Ensure a number is finite; return 0 for non-finite values. */
function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------

export function mapCategoryBreakdown(
  rows: RawCategoryRow[],
): CategoryBreakdown[] {
  return rows.map((row) => ({
    category: row.display_name,
    amount: safeNum(row.total_amount),
  }));
}

// ---------------------------------------------------------------------------
// Account breakdown
// ---------------------------------------------------------------------------

export function mapAccountBreakdown(rows: RawAccountRow[]): AccountBreakdown[] {
  return rows.map((row) => ({
    account: row.display_name,
    amount: safeNum(row.total_amount),
  }));
}

// ---------------------------------------------------------------------------
// Monthly summary
// ---------------------------------------------------------------------------

export function mapMonthlySummary(
  month: string,
  totals: RawMonthlyTotalsRow,
  categoryRows: RawCategoryRow[],
  accountRows: RawAccountRow[],
): MonthlySummary {
  const totalIncome = safeNum(totals.total_income);
  const totalExpense = safeNum(totals.total_expense);

  return {
    month,
    totalIncome,
    totalExpense,
    netCashflow: totalIncome - totalExpense,
    categoryBreakdown: mapCategoryBreakdown(categoryRows),
    accountBreakdown: mapAccountBreakdown(accountRows),
  };
}

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

export function mapTransactionRow(row: RawTransactionRow): TransactionRow {
  return {
    id: row.id,
    date: row.date,
    item: row.item_label,
    amount: safeNum(row.amount),
    account: row.account_display_name,
    category: row.category_display_name,
    type: row.transaction_type as TransactionRow["type"],
    currency: row.currency,
    merchant: row.merchant ?? undefined,
    note: row.note ?? undefined,
  };
}

export function mapTransactionRows(
  rows: RawTransactionRow[],
): TransactionRow[] {
  return rows.map(mapTransactionRow);
}

// ---------------------------------------------------------------------------
// Account info
// ---------------------------------------------------------------------------

export function mapAccountInfo(row: RawAccountRow_full): AccountInfo {
  return {
    name: row.display_name,
    balance: safeNum(row.current_balance),
    type: row.account_type,
  };
}

export function mapAccountInfos(rows: RawAccountRow_full[]): AccountInfo[] {
  return rows.map(mapAccountInfo);
}

// ---------------------------------------------------------------------------
// Loan info
// ---------------------------------------------------------------------------

export function mapLoanInfo(row: RawLoanRow): LoanInfo {
  return {
    name: row.display_name,
    principal: safeNum(row.principal_original),
    interest: safeNum(row.monthly_interest_total),
    remainingBalance: safeNum(row.principal_current),
  };
}

export function mapLoanInfos(rows: RawLoanRow[]): LoanInfo[] {
  return rows.map(mapLoanInfo);
}

// ---------------------------------------------------------------------------
// Balance snapshot
// ---------------------------------------------------------------------------

export function mapBalanceSnapshot(
  row: RawBalanceSnapshotRow,
): BalanceSnapshot {
  const balance = safeNum(row.balance);

  return {
    date: row.snapshot_date,
    totalAssets: balance >= 0 ? balance : 0,
    totalLiabilities: balance < 0 ? Math.abs(balance) : 0,
    netWorth: balance,
  };
}

export function mapBalanceSnapshots(
  rows: RawBalanceSnapshotRow[],
): BalanceSnapshot[] {
  return rows.map(mapBalanceSnapshot);
}
