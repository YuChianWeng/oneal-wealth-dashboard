/**
 * Net-worth calculations from balance snapshots.
 *
 * Takes a set of BalanceSnapshot records (from the finance repository) and
 * produces a time series with explicit coverage metadata.  When not all
 * configured accounts have data, the series is still returned but labelled
 * with a coverage warning so the UI can surface gaps.
 *
 * All functions are pure — no I/O, no database access.
 */

import type { BalanceSnapshot } from "@/lib/schemas/finance";
import type { NetWorthPoint, NetWorthSeries } from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a net-worth time series from balance snapshots.
 *
 * Snapshots are expected to be pre-aggregated — each snapshot represents
 * the total assets and liabilities across all available accounts at a
 * single point in time.  The repository layer is responsible for that
 * aggregation; this function just orders and labels.
 *
 * @param snapshots       array of balance snapshots (any order).
 * @param totalAccounts   total number of accounts in the user's configuration.
 * @param coveredAccounts number of accounts for which snapshot data exists.
 * @returns NetWorthSeries, or null/empty when snapshots are insufficient.
 */
export function computeNetWorth(
  snapshots: BalanceSnapshot[],
  totalAccounts: number,
  coveredAccounts: number,
): NetWorthSeries | null {
  // ------ Guard: no data ----------------------------------------------------
  if (snapshots.length === 0) {
    return null;
  }

  // ------ Guard: insufficient coverage --------------------------------------
  if (coveredAccounts === 0) {
    return null;
  }

  // ------ Sort ascending by date --------------------------------------------
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));

  // ------ Build points ------------------------------------------------------
  const points: NetWorthPoint[] = sorted.map((s) => ({
    date: s.date,
    totalAssets: s.totalAssets,
    totalLiabilities: s.totalLiabilities,
    netWorth: s.netWorth,
  }));

  // ------ Coverage label ----------------------------------------------------
  const fullCoverage = coveredAccounts >= totalAccounts;
  const coverageLabel: string | null = fullCoverage
    ? null
    : `${coveredAccounts} of ${totalAccounts} accounts available`;

  return {
    points,
    coverageLabel,
    totalAccounts,
    coveredAccounts,
  };
}

/**
 * Convenience: extract the latest net-worth value, or null.
 */
export function latestNetWorth(series: NetWorthSeries | null): number | null {
  if (!series || series.points.length === 0) return null;
  return series.points[series.points.length - 1].netWorth;
}

/**
 * Convenience: check whether coverage is complete enough to display.
 */
export function isCoverageSufficient(series: NetWorthSeries | null): boolean {
  if (!series) return false;
  return series.coveredAccounts > 0;
}
