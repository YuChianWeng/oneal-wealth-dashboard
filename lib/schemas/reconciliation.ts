import "server-only";

/**
 * Strict API-facing contracts for investment cash reconciliation.
 *
 * These schemas expose only the auditable view model. Raw note metadata and
 * source paths must remain in the repository layer.
 */

import { z } from "zod";
import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

const amount = () => z.number().finite();
const date = () => z.string().date();

export const PendingSettlementSchema = z
  .object({
    id: z.string().min(1),
    symbol: z.string().min(1),
    side: z.enum(["buy", "sell"]),
    tradeDate: date(),
    settlementDate: date().nullable(),
    netCashflow: amount(),
    effectiveCashAdjustment: amount(),
    ageTradingDays: z.number().int().nonnegative().nullable(),
    status: z.enum(["pending", "overdue", "covered-by-cash-snapshot"]),
  })
  .strict();

export type PendingSettlement = z.infer<typeof PendingSettlementSchema>;

export const InvestmentReconciliationSchema = z
  .object({
    valuationDate: date(),
    confirmedCash: amount(),
    cashAsOfDate: date(),
    cashAsOfSource: z.string().min(1).optional(),
    cashAsOfQuality: z
      .enum([
        "confirmed-explicit-event",
        "inferred-from-balance-entry",
        "unavailable",
      ])
      .optional(),
    pendingTradeCashAdjustment: amount(),
    effectiveCashValue: amount(),
    holdingsMarketValue: amount(),
    strategyValue: amount(),
    pendingSettlements: z.array(PendingSettlementSchema),
    status: z.enum(["reconciled", "attention", "unavailable"]),
    warnings: z.array(z.string()),
  })
  .strict();

export type InvestmentReconciliation = z.infer<
  typeof InvestmentReconciliationSchema
>;
