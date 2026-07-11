"use client";

import useSWR, { type SWRConfiguration } from "swr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Standard API response envelope (versioned). */
export interface ApiResponse<T> {
  version: number;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/** Default JSON fetcher for SWR. */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const body: ApiResponse<T> = await res.json();
  if (body.error) {
    throw new Error(body.error.message);
  }
  return body.data as T;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * SWR wrapper for the Oneal Wealth Dashboard API.
 *
 * Extracts `data` from the standard `{ version, data }` envelope.
 * Returns the same shape as `useSWR` but with `data` being `T | undefined`
 * (the unwrapped payload).
 */
export function useApi<T>(
  url: string | null,
  config?: SWRConfiguration<T>,
) {
  const swr = useSWR<T>(url, fetcher, config);

  return {
    data: swr.data,
    error: swr.error,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    mutate: swr.mutate,
  };
}
