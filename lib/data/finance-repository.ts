/**
 * Typed Finance Repository.
 *
 * Wraps the raw query layer with Zod schema validation and returns
 * Result<T, SourceError> for every operation. This is the sole public
 * API for reading finance data — consumers never touch the DB
 * connection or raw query functions directly.
 *
 * Every function:
 *  1. Calls the corresponding query function(s)
 *  2. Maps raw rows → view-model types via the mapper layer
 *  3. Validates output against a Zod schema (defence-in-depth)
 *  4. Returns Ok(validated) or Err(SourceError with safe message)
 *  5. NEVER throws on data issues
 */

import "server-only";

import { z } from "zod";
import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { ok, err } from "@/lib/result";
import type { Result } from "@/lib/result";
import {
  MonthlySummarySchema,
  TransactionRowSchema,
  AccountInfoSchema,
  LoanInfoSchema,
  BalanceSnapshotSchema,
  CategoryBreakdownSchema,
  AccountBreakdownSchema,
} from "@/lib/schemas/finance";
import type {
  MonthlySummary,
  TransactionRow,
  AccountInfo,
  LoanInfo,
  BalanceSnapshot,
  CategoryBreakdown,
  AccountBreakdown,
} from "@/lib/schemas/finance";
import { getDb } from "./finance-db";
import {
  getMonthlyTotals,
  getCategoryBreakdown,
  getAccountBreakdown,
  getTransactionsPage,
  getTransactionsCount,
  getBalanceSnapshots,
  getAccountsList,
  getLoansSummary,
} from "./finance-queries";
import {
  mapMonthlySummary,
  mapCategoryBreakdown,
  mapAccountBreakdown,
  mapTransactionRows,
  mapAccountInfos,
  mapLoanInfos,
  mapBalanceSnapshots,
} from "./finance-mappers";

assertServerOnly();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a single value against a Zod schema, returning Ok or Err.
 */
function validateOne<T>(
  value: T,
  schema: z.ZodType<T>,
  label: string,
): Result<T, SourceError> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return ok(parsed.data);
  return err(
    new SourceError(
      `Data validation failed for ${label}: ${parsed.error.message}`,
      "SOURCE_VALIDATION_ERROR",
      parsed.error,
    ),
  );
}

/**
 * Validate an array of values against a Zod schema, returning Ok or Err.
 */
function validateArray<T>(
  items: T[],
  schema: z.ZodType<T>,
  label: string,
): Result<T[], SourceError> {
  const arraySchema = z.array(schema);
  const parsed = arraySchema.safeParse(items);
  if (parsed.success) return ok(parsed.data);
  return err(
    new SourceError(
      `Data validation failed for ${label}: ${parsed.error.message}`,
      "SOURCE_VALIDATION_ERROR",
      parsed.error,
    ),
  );
}

/**
 * Catch any unexpected throw from a DB operation and convert to Err.
 */
function catchDbError<E>(
  label: string,
  fn: () => Result<E, SourceError>,
): Result<E, SourceError> {
  try {
    return fn();
  } catch (cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : "Unknown database error";
    return err(
      new SourceError(
        `Database query failed for ${label}: ${message}`,
        "SOURCE_DB_ERROR",
        cause,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Repository public API
// ---------------------------------------------------------------------------

/**
 * Monthly finance summary aggregated by type, category, and account.
 *
 * Investment-bucket accounts are excluded from the totals.
 *
 * @param month  YYYY-MM string (e.g. "2026-06")
 */
export function monthlySummary(
  month: string,
): Result<MonthlySummary, SourceError> {
  return catchDbError("monthlySummary", () => {
    const db = getDb();
    const totals = getMonthlyTotals(db, month);
    // If the totals row doesn't exist at all, it's truly missing data
    if (!totals) {
      return err(
        new SourceError(`No data found for month ${month}`, "SOURCE_NOT_FOUND"),
      );
    }
    const categoryRows = getCategoryBreakdown(db, month);
    const accountRows = getAccountBreakdown(db, month);

    // If there are literally no transactions for this month at all
    // (including non-expense), return a valid empty summary
    const mapped = mapMonthlySummary(month, totals, categoryRows, accountRows);
    return validateOne(mapped, MonthlySummarySchema, "MonthlySummary");
  });
}

/**
 * Spending breakdown by category for a month.
 *
 * Only expense transactions; investment-bucket accounts excluded.
 *
 * @param month  YYYY-MM string
 */
export function categoryBreakdown(
  month: string,
): Result<CategoryBreakdown[], SourceError> {
  return catchDbError("categoryBreakdown", () => {
    const db = getDb();
    const rows = getCategoryBreakdown(db, month);
    const mapped = mapCategoryBreakdown(rows);
    return validateArray(mapped, CategoryBreakdownSchema, "CategoryBreakdown");
  });
}

/**
 * Spending breakdown by account for a month.
 *
 * Only expense transactions; investment-bucket accounts excluded.
 *
 * @param month  YYYY-MM string
 */
export function accountBreakdown(
  month: string,
): Result<AccountBreakdown[], SourceError> {
  return catchDbError("accountBreakdown", () => {
    const db = getDb();
    const rows = getAccountBreakdown(db, month);
    const mapped = mapAccountBreakdown(rows);
    return validateArray(mapped, AccountBreakdownSchema, "AccountBreakdown");
  });
}

/**
 * Paginated transactions for a month.
 *
 * Investment-bucket accounts are excluded. Returns rows with
 * pagination metadata.
 *
 * @param month    YYYY-MM string
 * @param page     1-indexed page number
 * @param pageSize number of results per page
 */
export function transactionsPage(
  month: string,
  page: number,
  pageSize: number,
): Result<
  { rows: TransactionRow[]; total: number; page: number; pageSize: number },
  SourceError
> {
  return catchDbError("transactionsPage", () => {
    const db = getDb();
    const total = getTransactionsCount(db, month);
    const rows = getTransactionsPage(db, month, page, pageSize);
    const mapped = mapTransactionRows(rows);
    const validated = validateArray(
      mapped,
      TransactionRowSchema,
      "TransactionRow",
    );
    if (!validated.ok) return validated;
    return ok({
      rows: validated.value,
      total,
      page,
      pageSize,
    });
  });
}

/**
 * Balance snapshot time series for a given account.
 *
 * Returns snapshots ordered by date ascending from `since` onward.
 *
 * @param accountKey  the `account_key` in the accounts table
 * @param since       ISO date string (YYYY-MM-DD) lower bound (inclusive)
 */
export function balanceSnapshots(
  accountKey: string,
  since: string,
): Result<BalanceSnapshot[], SourceError> {
  return catchDbError("balanceSnapshots", () => {
    const db = getDb();
    const rows = getBalanceSnapshots(db, accountKey, since);
    const mapped = mapBalanceSnapshots(rows);
    return validateArray(mapped, BalanceSnapshotSchema, "BalanceSnapshot");
  });
}

/**
 * List of all active accounts with the latest balance snapshot.
 */
export function accountsList(): Result<AccountInfo[], SourceError> {
  return catchDbError("accountsList", () => {
    const db = getDb();
    const rows = getAccountsList(db);
    const mapped = mapAccountInfos(rows);
    return validateArray(mapped, AccountInfoSchema, "AccountInfo");
  });
}

/**
 * Current summary of all active loans with computed monthly interest.
 */
export function loansSummary(): Result<LoanInfo[], SourceError> {
  return catchDbError("loansSummary", () => {
    const db = getDb();
    const rows = getLoansSummary(db);
    const mapped = mapLoanInfos(rows);
    return validateArray(mapped, LoanInfoSchema, "LoanInfo");
  });
}
