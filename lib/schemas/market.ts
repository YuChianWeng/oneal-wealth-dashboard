import "server-only";

import { z } from "zod";
import { assertServerOnly } from "@/lib/server-only";

assertServerOnly();

const finiteNumber = z.number().finite();
const nullableFiniteNumber = finiteNumber.nullable();
const timestamp = z.string().datetime({ offset: true });

export const MarketSourceSchema = z.enum(["kgi", "twse", "taifex"]);
export type MarketSource = z.infer<typeof MarketSourceSchema>;

export const MarketSessionSchema = z.enum([
  "day",
  "night",
  "closed",
  "unknown",
]);
export type MarketSession = z.infer<typeof MarketSessionSchema>;

export const LiveMarketQuoteSchema = z
  .object({
    symbol: z.string().min(1),
    name: z.string().min(1),
    last: nullableFiniteNumber,
    reference: nullableFiniteNumber,
    change: nullableFiniteNumber,
    changePct: nullableFiniteNumber,
    observedAt: timestamp,
    providerSnapshotAt: timestamp.nullable(),
    source: MarketSourceSchema,
    marketSession: MarketSessionSchema,
    dataStatus: z.string().min(1),
    isStale: z.boolean(),
    snapshotAgeSeconds: finiteNumber.nonnegative(),
    contract: z.string().min(1).nullable(),
  })
  .strict();

export type LiveMarketQuote = z.infer<typeof LiveMarketQuoteSchema>;

export const MarketSnapshotErrorSchema = z
  .object({
    source: MarketSourceSchema,
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export type MarketSnapshotError = z.infer<typeof MarketSnapshotErrorSchema>;

export const MarketSnapshotSchema = z
  .object({
    version: z.literal(1),
    observedAt: timestamp,
    stocks: z.array(LiveMarketQuoteSchema),
    indices: z
      .object({
        taiex: LiveMarketQuoteSchema.nullable(),
      })
      .strict(),
    futures: z
      .object({
        txf: LiveMarketQuoteSchema.nullable(),
      })
      .strict(),
    errors: z.array(MarketSnapshotErrorSchema),
  })
  .strict();

export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;

export const IntradayPointSchema = z
  .object({
    timestamp,
    value: finiteNumber,
  })
  .strict();

export type IntradayPoint = z.infer<typeof IntradayPointSchema>;

export const IntradayMarketHistorySchema = z
  .object({
    version: z.literal(1),
    date: z.string().date(),
    session: z.enum(["day", "night"]),
    observedAt: timestamp,
    taiex: z.array(IntradayPointSchema),
    txf: z.array(IntradayPointSchema),
  })
  .strict();

export type IntradayMarketHistory = z.infer<typeof IntradayMarketHistorySchema>;
