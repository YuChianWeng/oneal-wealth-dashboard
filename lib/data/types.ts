/**
 * Shared data-layer types used by config, sources, and the read layer.
 *
 * These describe **internal** plumbing shapes — never exposed to the client
 * directly. View models are defined in lib/schemas/*.
 */

import type { TradeDataQuality } from "@/lib/schemas/portfolio";

// ---------------------------------------------------------------------------
// Source identifiers
// ---------------------------------------------------------------------------

export type SourceName = "finance-db" | "obsidian-vault" | "broker-csv";

// ---------------------------------------------------------------------------
// Raw timestamp helper
// ---------------------------------------------------------------------------

/**
 * ISO-8601 string representing an instant in Asia/Taipei time.
 * All dates flowing through the data layer use this format.
 */
export type ISODateString = string & { readonly __brand: "ISODateString" };

// ---------------------------------------------------------------------------
// Finance DB shapes (raw — never exposed to client)
// ---------------------------------------------------------------------------

export interface RawFinanceTransaction {
  id: number;
  item: string;
  amount: number;
  account: string;
  category: string;
  transaction_type: string;
  currency: string;
  timestamp: string;
  note?: string;
  merchant?: string;
  symbol?: string;
}

export interface RawMonthlyAggregate {
  month: string;
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  categoryBreakdown: Array<{ category: string; amount: number }>;
  accountBreakdown: Array<{ account: string; amount: number }>;
}

// ---------------------------------------------------------------------------
// Obsidian vault shapes (raw — never exposed to client)
// ---------------------------------------------------------------------------

export interface RawPortfolioPosition {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnl?: number;
  unrealizedPnlPct?: number;
  sector?: string;
  theme?: string;
  conviction?: number;
  status?: string;
  lastChecked?: string;
  notePath: string;
}

export interface RawTradeRecord {
  symbol: string;
  name: string;
  tradeDate: string;
  settlementDate?: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  grossAmount?: number;
  feeTax?: number;
  netCashflow?: number;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  dataQuality?: TradeDataQuality;
  realizedPnlIncludesFeeTax?: boolean;
  broker?: string;
  account?: string;
  reason?: string;
  strategy?: string;
  notePath: string;
}

export interface RawStockResearch {
  symbol: string;
  name: string;
  status: string;
  sector?: string;
  theme?: string;
  conviction?: number;
  thesis?: string;
  catalysts?: string;
  risks?: string;
  invalidation?: string;
  nextStep?: string;
  notePath: string;
}

// ---------------------------------------------------------------------------
// Source health (internal)
// ---------------------------------------------------------------------------

export interface InternalSourceHealth {
  sourceName: SourceName;
  /** Absolute path to the source (internal, never sent to client). */
  sourcePath: string;
  lastModifiedAt: ISODateString | null;
  lastSuccessfulReadAt: ISODateString | null;
  recordCount: number;
  warningCount: number;
  errorCode?: string;
  /** Raw underlying error — logged server-side only. */
  rawError?: unknown;
}
