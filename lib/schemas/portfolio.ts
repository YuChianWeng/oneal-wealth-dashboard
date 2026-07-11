import "server-only";

/**
 * Zod schemas for portfolio view models.
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
// Position summary
// ---------------------------------------------------------------------------

export const PositionSummarySchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().min(1),
    shares: amount(),
    avgCost: amount(),
    currentPrice: amount().nullable(),
    marketValue: amount().nullable(),
    unrealizedPnl: amount().nullable(),
    unrealizedPnlPct: amount().nullable(),
    sector: z.string().nullable().optional(),
    theme: z.string().nullable().optional(),
    conviction: z.number().int().min(1).max(5).nullable().optional(),
    status: z.string().optional(),
    lastChecked: dateStr().nullable().optional(),
  })
  .strict();

export type PositionSummary = z.infer<typeof PositionSummarySchema>;

// ---------------------------------------------------------------------------
// Holding allocation
// ---------------------------------------------------------------------------

export const HoldingAllocationSchema = z
  .object({
    category: z.string().min(1),
    value: amount(),
    percentage: amount(),
  })
  .strict();

export type HoldingAllocation = z.infer<typeof HoldingAllocationSchema>;

// ---------------------------------------------------------------------------
// Trade record
// ---------------------------------------------------------------------------

export const TradeRecordSchema = z
  .object({
    id: z.string().min(1),
    date: dateStr(),
    symbol: z.string().min(1),
    name: z.string().min(1),
    side: z.enum(["buy", "sell"]),
    shares: amount(),
    price: amount(),
    grossAmount: amount().optional(),
    feeTax: amount().optional(),
    netCashflow: amount().optional(),
  })
  .strict();

export type TradeRecord = z.infer<typeof TradeRecordSchema>;

// ---------------------------------------------------------------------------
// Snapshot point (for time-series charts)
// ---------------------------------------------------------------------------

export const SnapshotPointSchema = z
  .object({
    date: dateStr(),
    totalValue: amount(),
  })
  .strict();

export type SnapshotPoint = z.infer<typeof SnapshotPointSchema>;

// ---------------------------------------------------------------------------
// Performance series
// ---------------------------------------------------------------------------

export const PerformanceSeriesSchema = z
  .object({
    period: z.enum(["1M", "3M", "6M", "YTD", "1Y", "ALL"]),
    return: amount(),
    benchmark: amount().optional(),
  })
  .strict();

export type PerformanceSeries = z.infer<typeof PerformanceSeriesSchema>;

// ---------------------------------------------------------------------------
// Stock thesis (view model — not the full research note)
// ---------------------------------------------------------------------------

export const StockThesisSchema = z
  .object({
    symbol: z.string().min(1),
    thesis: z.string(),
    conviction: z.number().int().min(1).max(5),
    lastUpdated: dateStr().nullable().optional(),
  })
  .strict();

export type StockThesis = z.infer<typeof StockThesisSchema>;
