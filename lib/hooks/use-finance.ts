"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type {
  MonthlySummary,
  TransactionRow,
  AccountInfo,
  LoanInfo,
} from "@/lib/schemas/finance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaginatedTransactions {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AccountsData {
  accounts: AccountInfo[];
  loans: LoanInfo[];
}

export interface ReviewsData {
  months: string[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch monthly finance summary.
 * Returns undefined while loading, throws on error (caught by ErrorBoundary
 * or the page's error state).
 */
export function useMonthlySummary(month: string) {
  const key = month ? `/api/finance/summary?month=${month}` : null;
  return useSWR<MonthlySummary>(key, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

/**
 * Fetch paginated transactions for a month.
 */
export function useTransactions(
  month: string,
  page = 1,
  pageSize = 20,
  category?: string,
  account?: string,
) {
  const params = new URLSearchParams({ month, page: String(page), pageSize: String(pageSize) });
  if (category) params.set("category", category);
  if (account) params.set("account", account);

  const key = month ? `/api/finance/transactions?${params.toString()}` : null;
  return useSWR<PaginatedTransactions>(key, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

/**
 * Fetch account list + loan summary.
 */
export function useAccounts() {
  return useSWR<AccountsData>("/api/finance/accounts", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 120_000,
  });
}

/**
 * Fetch available monthly reviews.
 */
export function useReviews() {
  return useSWR<ReviewsData>("/api/finance/reviews", swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
}
