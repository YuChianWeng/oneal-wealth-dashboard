import "server-only";

/**
 * Zod schemas for research view models.
 *
 * These describe **only** what the API returns — never raw source data shapes.
 * All dates are ISO-8601 strings.
 * Uses .strict() to reject extra fields (prevents accidental field leakage).
 */

import { z } from "zod";
import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

// ---------------------------------------------------------------------------
// Research summary
// ---------------------------------------------------------------------------

export const ResearchSummarySchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().min(1),
    status: z.string().min(1),
    sector: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    subindustry: z.string().nullable().optional(),
    portfolioRole: z.string().nullable().optional(),
    themes: z.array(z.string().min(1)).optional(),
    theme: z.string().nullable().optional(),
    classificationVersion: z.number().int().positive().nullable().optional(),
    classificationStatus: z.string().nullable().optional(),
    assetClass: z.string().nullable().optional(),
    market: z.string().nullable().optional(),
    conviction: z.number().int().min(1).max(5).nullable().optional(),
    thesis: z.string().nullable(),
    catalysts: z.string().nullable(),
    risks: z.string().nullable(),
    invalidation: z.string().nullable(),
    nextStep: z.string().nullable(),
    sourceChecked: z.string().date().nullable(),
    lastUpdated: z.string().date().nullable().optional(),
  })
  .strict();

export type ResearchSummary = z.infer<typeof ResearchSummarySchema>;
