"use server";

/**
 * Typed source-health diagnostics.
 *
 * The types here describe fields that are **safe** for client consumption.
 * Internal machinery (paths, raw errors) stays in lib/data/types.ts.
 */

import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

// ---------------------------------------------------------------------------
// Client-facing types
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "degraded" | "unavailable";

/**
 * Public source-health snapshot.
 * Contains **no absolute paths** and **no raw error objects**.
 */
export interface SourceHealth {
  sourceName: string;
  lastModifiedAt: string | null;
  lastSuccessfulReadAt: string | null;
  recordCount: number;
  warningCount: number;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface AggregateInput {
  sources: SourceHealth[];
  /** How many sources must be unavailable to classify the whole system as unavailable. */
  unavailableThreshold?: number;
  /** How many sources must be degraded to classify the whole system as degraded. */
  degradedThreshold?: number;
}

/**
 * Compute an overall system health status from individual source snapshots.
 *
 * - **unavailable** — at least one source has an `errorCode` **and** at least
 *   `unavailableThreshold` sources are unavailable.
 * - **degraded** — at least `degradedThreshold` sources have warnings (warningCount > 0)
 *   or are unavailable.
 * - **healthy** — everything else.
 *
 * Defaults are sensible for a 2-source system (finance-db + obsidian-vault):
 *   1 unavailable → system unavailable
 *   1+ degraded  → system degraded
 */
export function aggregateHealth(sources: SourceHealth[]): HealthStatus {
  const unavailable = sources.filter((s) => s.errorCode !== undefined);
  const degraded = sources.filter(
    (s) => s.errorCode !== undefined || s.warningCount > 0,
  );

  if (unavailable.length > 0) return "unavailable";
  if (degraded.length > 0) return "degraded";
  return "healthy";
}
