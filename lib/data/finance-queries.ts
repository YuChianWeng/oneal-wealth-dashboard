/**
 * Parameterized read-only SQL queries for the Finance SQLite database.
 *
 * Every function accepts a better-sqlite3 Database instance and returns
 * raw rows directly from the database. All user-supplied values are
 * bound via `?` placeholders — never interpolated into SQL strings.
 *
 * Consumption queries (monthlySummary, categoryBreakdown, accountBreakdown,
 * transactionsPage) exclude investment-bucket accounts by default so that
 * investment settlements don't distort living-expense dashboards.
 */

import "server-only";

import type Database from "better-sqlite3";
import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

/** Subquery that returns the account_keys in the investment bucket. */
const INVESTMENT_ACCOUNTS_CTE = `
WITH investment_accounts AS (
  SELECT account_key FROM accounts WHERE bucket = 'investment'
)
`;

/** WHERE clause appended to consumption queries to exclude investment accounts. */
const EXCLUDE_INVESTMENT_WHERE = `
  AND t.account_key NOT IN (SELECT account_key FROM investment_accounts)
`;

// ---------------------------------------------------------------------------
// Raw row types (internal — never exported to the view layer)
// ---------------------------------------------------------------------------

export interface RawMonthlyTotalsRow {
  total_income: number;
  total_expense: number;
}

export interface RawCategoryRow {
  category_key: string;
  display_name: string;
  total_amount: number;
}

export interface RawAccountRow {
  account_key: string;
  display_name: string;
  total_amount: number;
}

export interface RawTransactionRow {
  id: number;
  date: string;
  transaction_type: string;
  account_key: string;
  account_display_name: string;
  account_bucket: string;
  category_key: string;
  category_display_name: string;
  amount: number;
  currency: string;
  merchant: string | null;
  note: string | null;
  item_label: string;
}

export interface RawAccountRow_full {
  account_key: string;
  display_name: string;
  currency: string;
  account_type: string;
  is_active: number;
  is_debt: number;
  bucket: string;
  current_balance: number | null;
}

export interface RawLoanRow {
  loan_key: string;
  display_name: string;
  principal_original: number;
  principal_current: number;
  annual_interest_rate: number;
  monthly_interest_total: number;
}

export interface RawBalanceSnapshotRow {
  snapshot_date: string;
  balance: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Query cache helpers (for tests that re-use the same db handle)
// ---------------------------------------------------------------------------

/**
 * Monthly income / expense totals.
 *
 * Returns one row with `total_income` and `total_expense` for the
 * given YYYY-MM month. Investment-bucket transactions are excluded.
 */
export function getMonthlyTotals(
  db: Database.Database,
  month: string,
): RawMonthlyTotalsRow | undefined {
  const sql = `
    ${INVESTMENT_ACCOUNTS_CTE}
    SELECT
      COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN t.transaction_type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expense
    FROM transactions t
    WHERE strftime('%Y-%m', t.date) = ?
    ${EXCLUDE_INVESTMENT_WHERE}
  `;
  return db.prepare(sql).get(month) as RawMonthlyTotalsRow | undefined;
}

/**
 * Spending grouped by category for a given YYYY-MM month.
 *
 * Only `expense` transactions are summed. Investment-bucket accounts
 * are excluded.
 */
export function getCategoryBreakdown(
  db: Database.Database,
  month: string,
): RawCategoryRow[] {
  const sql = `
    ${INVESTMENT_ACCOUNTS_CTE}
    SELECT
      t.category_key,
      COALESCE(c.display_name, t.category_key) AS display_name,
      SUM(t.amount) AS total_amount
    FROM transactions t
    LEFT JOIN categories c ON c.category_key = t.category_key
    WHERE strftime('%Y-%m', t.date) = ?
      AND t.transaction_type = 'expense'
      ${EXCLUDE_INVESTMENT_WHERE}
    GROUP BY t.category_key
    ORDER BY total_amount DESC
  `;
  return db.prepare(sql).all(month) as RawCategoryRow[];
}

/**
 * Spending grouped by account for a given YYYY-MM month.
 *
 * Only `expense` transactions are summed. Investment-bucket accounts
 * are excluded.
 */
export function getAccountBreakdown(
  db: Database.Database,
  month: string,
): RawAccountRow[] {
  const sql = `
    ${INVESTMENT_ACCOUNTS_CTE}
    SELECT
      t.account_key,
      COALESCE(a.display_name, t.account_key) AS display_name,
      SUM(t.amount) AS total_amount
    FROM transactions t
    LEFT JOIN accounts a ON a.account_key = t.account_key
    WHERE strftime('%Y-%m', t.date) = ?
      AND t.transaction_type = 'expense'
      ${EXCLUDE_INVESTMENT_WHERE}
    GROUP BY t.account_key
    ORDER BY total_amount DESC
  `;
  return db.prepare(sql).all(month) as RawAccountRow[];
}

/**
 * Paginated transactions for a given YYYY-MM month.
 *
 * Returns rows ordered by date DESC, then id DESC. Investment-bucket
 * accounts are excluded.
 *
 * @param month  YYYY-MM string
 * @param page   1-indexed page number
 * @param pageSize number of rows per page
 */
export function getTransactionsPage(
  db: Database.Database,
  month: string,
  page: number,
  pageSize: number,
): RawTransactionRow[] {
  const offset = (page - 1) * pageSize;
  const sql = `
    ${INVESTMENT_ACCOUNTS_CTE}
    SELECT
      t.id,
      t.date,
      t.transaction_type,
      t.account_key,
      a.display_name AS account_display_name,
      a.bucket AS account_bucket,
      t.category_key,
      COALESCE(c.display_name, t.category_key) AS category_display_name,
      t.amount,
      t.currency,
      t.merchant,
      t.note,
      COALESCE(NULLIF(t.merchant, ''), NULLIF(t.note, ''), COALESCE(c.display_name, t.category_key)) AS item_label
    FROM transactions t
    LEFT JOIN accounts a ON a.account_key = t.account_key
    LEFT JOIN categories c ON c.category_key = t.category_key
    WHERE strftime('%Y-%m', t.date) = ?
      ${EXCLUDE_INVESTMENT_WHERE}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ? OFFSET ?
  `;
  return db.prepare(sql).all(month, pageSize, offset) as RawTransactionRow[];
}

/**
 * Count transactions for a YYYY-MM month (excluding investment accounts).
 */
export function getTransactionsCount(
  db: Database.Database,
  month: string,
): number {
  const sql = `
    ${INVESTMENT_ACCOUNTS_CTE}
    SELECT COUNT(*) AS cnt
    FROM transactions t
    WHERE strftime('%Y-%m', t.date) = ?
      ${EXCLUDE_INVESTMENT_WHERE}
  `;
  const row = db.prepare(sql).get(month) as { cnt: number };
  return row.cnt;
}

/**
 * Balance snapshot time series for a given account.
 *
 * Returns rows ordered by snapshot_date ASC, starting from `since` (inclusive).
 *
 * @param accountKey  the `account_key` value (not display name)
 * @param since       ISO date string (YYYY-MM-DD) — lower bound
 */
export function getBalanceSnapshots(
  db: Database.Database,
  accountKey: string,
  since: string,
): RawBalanceSnapshotRow[] {
  const sql = `
    SELECT
      snapshot_date,
      balance,
      currency
    FROM balance_snapshots
    WHERE account_key = ?
      AND snapshot_date >= ?
    ORDER BY snapshot_date ASC
  `;
  return db.prepare(sql).all(accountKey, since) as RawBalanceSnapshotRow[];
}

/**
 * All active accounts with bucket and balance info.
 *
 * Balance is derived from the most recent balance_snapshot for each
 * account (NULL if none exists).
 */
export function getAccountsList(db: Database.Database): RawAccountRow_full[] {
  const sql = `
    SELECT
      a.account_key,
      a.display_name,
      a.currency,
      a.account_type,
      a.is_active,
      a.is_debt,
      a.bucket,
      (
        SELECT bs.balance
        FROM balance_snapshots bs
        WHERE bs.account_key = a.account_key
        ORDER BY bs.snapshot_date DESC, bs.snapshot_time DESC
        LIMIT 1
      ) AS current_balance
    FROM accounts a
    WHERE a.is_active = 1
    ORDER BY a.bucket, a.display_name
  `;
  return db.prepare(sql).all() as RawAccountRow_full[];
}

/**
 * Current loan summary.
 *
 * Returns one row per active loan with computed monthly interest
 * (principal_current * annual_interest_rate / 12).
 */
export function getLoansSummary(db: Database.Database): RawLoanRow[] {
  const sql = `
    SELECT
      l.loan_key,
      l.display_name,
      l.principal_original,
      l.principal_current,
      l.annual_interest_rate,
      ROUND(l.principal_current * l.annual_interest_rate / 12.0, 2) AS monthly_interest_total
    FROM loans l
    WHERE l.status = 'active'
    ORDER BY l.display_name
  `;
  return db.prepare(sql).all() as RawLoanRow[];
}
