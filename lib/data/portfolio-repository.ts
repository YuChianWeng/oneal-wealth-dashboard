import "server-only";

import { createHash } from "node:crypto";

/**
 * Portfolio repository — read-only access to position, trade, and snapshot data.
 *
 * Reads from whitelisted vault paths via vault-reader. All errors are
 * wrapped in SourceError; malformed YAML is handled gracefully (returns
 * Err, never crashes).
 */

import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import { readNote, listNotes, type RawNote } from "@/lib/data/vault-reader";
import {
  PositionSummarySchema,
  TradeRecordSchema,
  SnapshotPointSchema,
  type PositionSummary,
  type TradeRecord,
  type SnapshotPoint,
} from "@/lib/schemas/portfolio";

assertServerOnly();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS_DIR = "Trading/Portfolio/Positions";
const TRANSACTIONS_DIR = "Trading/Portfolio/Transactions";
const SNAPSHOTS_DIR = "Trading/Portfolio/Snapshots";

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a note's frontmatter indicates an open position.
 */
function isOpenPosition(fm: Record<string, unknown>): boolean {
  const type = fm.type ?? fm.Type;
  const status = fm.status ?? fm.Status;
  return (
    String(type ?? "").toLowerCase() === "position" &&
    String(status ?? "").toLowerCase() === "open"
  );
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%,$\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDateOrEmpty(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === "string" ? value.trim() : "";
}

function exactIsoDateOrEmpty(value: unknown): string {
  const date = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
    ? date
    : "";
}

function firstPresent(...values: unknown[]): unknown {
  return values.find(
    (value) =>
      value !== null &&
      value !== undefined &&
      !(typeof value === "string" && value.trim() === ""),
  );
}

function strictTradeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value !== "number" && typeof value !== "string") return Number.NaN;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function nullableTradeNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const parsed = strictTradeNumber(value);
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function tradeDataQuality(value: unknown):
  | "confirmed"
  | "estimated-fee"
  | "needs-date-confirmation"
  | "needs-review"
  | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return "needs-review";
  const normalized = value.trim().toLowerCase();
  return normalized === "confirmed" ||
    normalized === "estimated-fee" ||
    normalized === "needs-date-confirmation" ||
    normalized === "needs-review"
    ? normalized
    : "needs-review";
}

function positionNameFromPath(path: string, symbol: string): string {
  const basename = path.split("/").pop()?.replace(/\.md$/i, "").trim() ?? "";
  if (basename.toUpperCase().startsWith(symbol.toUpperCase())) {
    const name = basename.slice(symbol.length).trim();
    if (name) return name;
  }
  return symbol;
}

/**
 * Convert a raw position note into a validated PositionSummary.
 */
function parsePosition(note: RawNote): Result<PositionSummary, SourceError> {
  const fm = note.frontmatter;
  // Canonical vault notes use ticker / entry_price / current_price; legacy
  // dashboard fixtures use camelCase. Support both without changing source data.
  const symbol = String(fm.symbol ?? fm.ticker ?? fm.Symbol ?? "").trim();

  if (!symbol) {
    return err(
      new SourceError(
        "Position note missing required symbol field",
        "VAULT_MISSING_SYMBOL",
      ),
    );
  }

  const shares = numberOrNull(fm.shares ?? fm.Shares) ?? 0;
  const avgCost =
    numberOrNull(
      fm.avgCost ?? fm["avg-cost"] ?? fm.entry_price ?? fm.AvgCost,
    ) ?? 0;
  const currentPrice = numberOrNull(
    fm.currentPrice ??
      fm["current-price"] ??
      fm.current_price ??
      fm.CurrentPrice,
  );
  const marketValue =
    numberOrNull(fm.marketValue ?? fm["market-value"] ?? fm.MarketValue) ??
    (currentPrice === null ? null : shares * currentPrice);
  const unrealizedPnl =
    numberOrNull(
      fm.unrealizedPnl ?? fm["unrealized-pnl"] ?? fm.UnrealizedPnl,
    ) ?? (marketValue === null ? null : marketValue - shares * avgCost);
  const unrealizedPnlPct = numberOrNull(
    fm.unrealizedPnlPct ??
      fm["unrealized-pnl-pct"] ??
      fm.unrealized_pnl ??
      fm.UnrealizedPnlPct,
  );

  const rawPosition = {
    symbol,
    name: String(
      fm.name ??
        fm.company_name ??
        fm.companyName ??
        fm.Name ??
        positionNameFromPath(note.path, symbol),
    ),
    shares,
    avgCost,
    currentPrice,
    marketValue,
    unrealizedPnl,
    unrealizedPnlPct,
    sector: fm.sector ?? fm.Sector ?? null,
    theme: fm.theme ?? fm.Theme ?? null,
    conviction: numberOrNull(fm.conviction ?? fm.Conviction),
    status: fm.status ?? fm.Status ?? "open",
    lastChecked:
      isoDateOrEmpty(
        fm.lastChecked ??
          fm["last-checked"] ??
          fm.last_checked ??
          fm.LastChecked ??
          fm.date,
      ) || null,
  };

  // Validate through zod schema
  try {
    return ok(PositionSummarySchema.parse(rawPosition));
  } catch (e) {
    return err(
      new SourceError(
        `Invalid position data for ${symbol}`,
        "VAULT_INVALID_POSITION",
        e,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Trade helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a note's frontmatter indicates a transaction.
 */
function isTransaction(fm: Record<string, unknown>): boolean {
  const type = fm.type ?? fm.Type;
  return String(type ?? "").toLowerCase() === "transaction";
}

function tradeBusinessId(
  trade: {
    date: string;
    settlementDate?: string;
    symbol: string;
    side: string;
    shares: number;
    price: number;
    grossAmount?: number;
    feeTax?: number;
    netCashflow?: number;
  },
  fm: Record<string, unknown>,
): string {
  const orderId = String(
    firstPresent(fm.orderId, fm["order-id"], fm.order_id) ?? "",
  ).trim();
  if (orderId) {
    const broker = String(fm.broker ?? fm.Broker ?? "unknown")
      .trim()
      .toLowerCase();
    return `order:${broker || "unknown"}:${orderId}`;
  }

  return [
    "trade",
    trade.date || "invalid-date",
    trade.symbol,
    trade.side,
    trade.shares,
    trade.price,
    trade.grossAmount ?? "",
    trade.feeTax ?? "",
    trade.netCashflow ?? "",
    trade.settlementDate ?? "",
  ].join(":");
}

/** A safe, public reference to a transaction with an integrity finding. */
export interface TradeIntegrityDiagnostic {
  id: string;
  symbol: string;
}

/** Read-only integrity findings that strict trade parsing cannot return. */
export interface TradeIntegrityDiagnostics {
  missingNetCashflow: TradeIntegrityDiagnostic[];
}

function publicTradeSymbol(value: unknown): string {
  const symbol = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{1,10}(?:\.[A-Z0-9]{1,6})?$/.test(symbol)
    ? symbol
    : "UNKNOWN";
}

function safeBusinessToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(token) ? token : undefined;
}

function finiteTradeNumber(value: unknown, fallback = 0): number {
  const parsed = strictTradeNumber(value);
  return parsed !== undefined && Number.isFinite(parsed) ? parsed : fallback;
}

function diagnosticTradeBusinessId(
  fm: Record<string, unknown>,
  symbol: string,
): string {
  const rawSettlement = firstPresent(
    fm.settlementDate,
    fm["settlement-date"],
    fm.settlement_date,
  );
  const side = String(fm.side ?? fm.Side ?? "")
    .trim()
    .toLowerCase();
  const orderId = safeBusinessToken(
    firstPresent(fm.orderId, fm["order-id"], fm.order_id),
  );
  const broker = safeBusinessToken(fm.broker ?? fm.Broker);

  const internalId = tradeBusinessId(
    {
      date: exactIsoDateOrEmpty(
        firstPresent(fm.tradeDate, fm["trade-date"], fm.trade_date, fm.date),
      ),
      ...(rawSettlement === undefined
        ? {}
        : { settlementDate: exactIsoDateOrEmpty(rawSettlement) }),
      symbol,
      side: side === "buy" || side === "sell" ? side : "unknown",
      shares: finiteTradeNumber(firstPresent(fm.shares, fm.Shares)),
      price: finiteTradeNumber(firstPresent(fm.price, fm.Price)),
      grossAmount: finiteTradeNumber(
        firstPresent(fm.grossAmount, fm["gross-amount"], fm.gross_amount),
      ),
      feeTax: finiteTradeNumber(
        firstPresent(fm.feeTax, fm["fee-tax"], fm.fee_tax),
      ),
    },
    {
      ...(orderId ? { orderId } : {}),
      ...(broker ? { broker } : {}),
    },
  );
  const digest = createHash("sha256").update(internalId, "utf8").digest("hex");
  return `trade-${digest}`;
}

function tradeIntegrityFinding(
  fm: Record<string, unknown>,
): TradeIntegrityDiagnostic | null {
  const netCashflow = strictTradeNumber(
    firstPresent(fm.netCashflow, fm["net-cashflow"], fm.net_cashflow),
  );
  if (
    netCashflow !== undefined &&
    Number.isFinite(netCashflow) &&
    netCashflow !== 0
  ) {
    return null;
  }

  const symbol = publicTradeSymbol(fm.symbol ?? fm.ticker ?? fm.Symbol);
  return { id: diagnosticTradeBusinessId(fm, symbol), symbol };
}

function sortedTradeIntegrityDiagnostics(
  findings: Map<string, TradeIntegrityDiagnostic>,
): TradeIntegrityDiagnostics {
  return {
    missingNetCashflow: [...findings.values()].sort(
      (a, b) => a.id.localeCompare(b.id) || a.symbol.localeCompare(b.symbol),
    ),
  };
}

export interface TradeInsightSources {
  trades: Result<TradeRecord[], SourceError>;
  tradeIntegrity: TradeIntegrityDiagnostics;
}

/**
 * Read transaction notes once for the Insights layer. Strict trade parsing and
 * typed diagnostics remain separate results over the same source snapshot.
 */
export function loadTradeInsightSources(): Result<
  TradeInsightSources,
  SourceError
> {
  const files = listNotes(TRANSACTIONS_DIR);
  if (!files.ok) return files;

  const trades: TradeRecord[] = [];
  const findings = new Map<string, TradeIntegrityDiagnostic>();
  let strictError: SourceError | null = null;

  for (const file of files.value) {
    const note = readNote(file);
    if (!note.ok) return err(note.error);
    if (!isTransaction(note.value.frontmatter)) continue;

    const finding = tradeIntegrityFinding(note.value.frontmatter);
    if (finding) findings.set(finding.id, finding);

    const parsed = parseTrade(note.value);
    if (parsed.ok) {
      trades.push(parsed.value);
    } else if (!strictError) {
      strictError = parsed.error;
    }
  }

  trades.sort((a, b) => b.date.localeCompare(a.date));
  return ok({
    trades: strictError ? err(strictError) : ok(trades),
    tradeIntegrity: sortedTradeIntegrityDiagnostics(findings),
  });
}

/**
 * Convert a raw transaction note into a validated TradeRecord.
 */
export function parseTrade(note: RawNote): Result<TradeRecord, SourceError> {
  const fm = note.frontmatter;
  const symbol = String(fm.symbol ?? fm.ticker ?? fm.Symbol ?? "").trim();

  if (!symbol) {
    return err(
      new SourceError(
        "Transaction note missing required symbol field",
        "VAULT_MISSING_SYMBOL",
      ),
    );
  }

  const rawSettlement = firstPresent(
    fm.settlementDate,
    fm["settlement-date"],
    fm.settlement_date,
  );
  const settlementDate =
    rawSettlement === undefined
      ? undefined
      : exactIsoDateOrEmpty(rawSettlement);
  const rawTradeWithoutId = {
    date: exactIsoDateOrEmpty(
      firstPresent(fm.tradeDate, fm["trade-date"], fm.trade_date, fm.date),
    ),
    ...(rawSettlement !== undefined ? { settlementDate } : {}),
    symbol,
    name: String(fm.name ?? fm.Name ?? symbol),
    side: String(fm.side ?? fm.Side ?? "").toLowerCase(),
    shares: strictTradeNumber(firstPresent(fm.shares, fm.Shares)) ?? Number.NaN,
    price: strictTradeNumber(firstPresent(fm.price, fm.Price)) ?? Number.NaN,
    grossAmount: strictTradeNumber(
      firstPresent(fm.grossAmount, fm["gross-amount"], fm.gross_amount),
    ),
    feeTax: strictTradeNumber(
      firstPresent(fm.feeTax, fm["fee-tax"], fm.fee_tax),
    ),
    realizedPnl: nullableTradeNumber(
      firstPresent(fm.realizedPnl, fm["realized-pnl"], fm.realized_pnl),
    ),
    unrealizedPnl: nullableTradeNumber(
      firstPresent(fm.unrealizedPnl, fm["unrealized-pnl"], fm.unrealized_pnl),
    ),
    dataQuality: tradeDataQuality(firstPresent(
      fm.dataQuality,
      fm["data-quality"],
      fm.data_quality,
      fm.DataQuality,
    )),
    realizedPnlIncludesFeeTax:
      fm.realizedPnlIncludesFeeTax ??
      fm["realized-pnl-includes-fee-tax"] ??
      fm.realized_pnl_includes_fee_tax,
    netCashflow: strictTradeNumber(
      firstPresent(fm.netCashflow, fm["net-cashflow"], fm.net_cashflow),
    ),
    reason: fm.reason ?? fm.Reason ?? null,
    strategy: fm.strategy ?? fm.Strategy ?? null,
    broker: fm.broker ?? fm.Broker ?? null,
    status: fm.status ?? fm.Status ?? null,
  };
  const rawTrade = {
    id: tradeBusinessId(rawTradeWithoutId, fm),
    ...rawTradeWithoutId,
  };

  try {
    return ok(TradeRecordSchema.parse(rawTrade));
  } catch (e) {
    return err(
      new SourceError(
        `Invalid trade data for ${symbol}`,
        "VAULT_INVALID_TRADE",
        e,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a note's frontmatter indicates a portfolio snapshot.
 */
function isSnapshot(fm: Record<string, unknown>): boolean {
  const type = fm.type ?? fm.Type;
  return String(type ?? "").toLowerCase() === "portfolio-snapshot";
}

/**
 * Convert a raw snapshot note into a validated SnapshotPoint.
 */
function parseSnapshot(note: RawNote): Result<SnapshotPoint, SourceError> {
  const fm = note.frontmatter;
  const date = isoDateOrEmpty(fm.date ?? fm.Date);

  const rawSnapshot = {
    date,
    totalValue:
      numberOrNull(fm.totalValue ?? fm["total-value"] ?? fm.market_value) ?? 0,
    externalCashFlow:
      numberOrNull(
        fm.externalCashFlow ??
          fm["external-cash-flow"] ??
          fm.external_cash_flow,
      ) ?? 0,
    benchmarkClose:
      numberOrNull(
        fm.benchmarkClose ?? fm["benchmark-close"] ?? fm.benchmark_close,
      ) ?? null,
  };

  try {
    return ok(SnapshotPointSchema.parse(rawSnapshot));
  } catch (e) {
    return err(
      new SourceError(
        `Invalid snapshot data for ${date || "unknown date"}`,
        "VAULT_INVALID_SNAPSHOT",
        e,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all open positions from the vault.
 *
 * Reads every .md file in Trading/Portfolio/Positions/, filters for
 * notes with type=position and status=open, and parses them into
 * validated PositionSummary objects.
 */
export function listOpenPositions(): Result<PositionSummary[], SourceError> {
  const files = listNotes(POSITIONS_DIR);
  if (!files.ok) return files;

  const results: PositionSummary[] = [];
  const errors: string[] = [];

  for (const f of files.value) {
    const note = readNote(f);
    if (!note.ok) {
      errors.push(`read error: ${note.error.message}`);
      continue;
    }

    if (!isOpenPosition(note.value.frontmatter)) continue;

    const parsed = parsePosition(note.value);
    if (parsed.ok) {
      results.push(parsed.value);
    } else {
      errors.push(`parse error: ${parsed.error.message}`);
    }
  }

  // Return partial results with a warning if some notes failed
  if (errors.length > 0 && results.length === 0) {
    return err(
      new SourceError(
        `Failed to read any positions: ${errors.join("; ")}`,
        "VAULT_POSITIONS_ALL_FAILED",
      ),
    );
  }

  return ok(results);
}

/**
 * Get a single open position by symbol.
 *
 * Matches the position file whose basename starts with the symbol.
 * For example, getPosition("2330.TW") would match "2330.TW.position.md".
 */
export function getPosition(
  symbol: string,
): Result<PositionSummary, SourceError> {
  const files = listNotes(POSITIONS_DIR);
  if (!files.ok) return files;

  const safeSymbol = symbol.trim().toUpperCase();
  const match = files.value.find((f) => {
    const base = f.split("/").pop() ?? "";
    return base.toUpperCase().startsWith(safeSymbol);
  });

  if (!match) {
    return err(
      new SourceError(
        `Position not found for symbol: ${symbol}`,
        "VAULT_POSITION_NOT_FOUND",
      ),
    );
  }

  const note = readNote(match);
  if (!note.ok) return note;

  if (!isOpenPosition(note.value.frontmatter)) {
    return err(
      new SourceError(
        `Position for ${symbol} is not open`,
        "VAULT_POSITION_CLOSED",
      ),
    );
  }

  return parsePosition(note.value);
}

/**
 * Get all transaction notes matching a symbol.
 *
 * Returns an empty array if no transactions are found (not an error).
 */
export function getTrades(symbol: string): Result<TradeRecord[], SourceError> {
  const files = listNotes(TRANSACTIONS_DIR);
  if (!files.ok) return files;

  const safeSymbol = symbol.trim().toUpperCase();
  const results: TradeRecord[] = [];

  for (const f of files.value) {
    const base = f.split("/").pop() ?? "";
    if (!base.toUpperCase().includes(safeSymbol)) continue;

    const note = readNote(f);
    if (!note.ok) return err(note.error);

    if (!isTransaction(note.value.frontmatter)) continue;

    const parsed = parseTrade(note.value);
    if (!parsed.ok) return err(parsed.error);
    results.push(parsed.value);
  }

  return ok(results);
}

/**
 * List all transaction notes across all symbols.
 *
 * Returns an empty array if no transactions are found (not an error).
 * Results are sorted descending by date (newest first).
 */
export function listAllTrades(): Result<TradeRecord[], SourceError> {
  const files = listNotes(TRANSACTIONS_DIR);
  if (!files.ok) return files;

  const results: TradeRecord[] = [];

  for (const f of files.value) {
    const note = readNote(f);
    if (!note.ok) return err(note.error);

    if (!isTransaction(note.value.frontmatter)) continue;

    const parsed = parseTrade(note.value);
    if (!parsed.ok) return err(parsed.error);
    results.push(parsed.value);
  }

  // Sort descending by date (newest first)
  results.sort((a, b) => b.date.localeCompare(a.date));

  return ok(results);
}

/**
 * Scan transaction frontmatter for net-cashflow integrity findings.
 *
 * This intentionally bypasses strict TradeRecord parsing so malformed cashflow
 * data remains observable without weakening the fail-closed trade APIs.
 */
export function tradeIntegrityDiagnostics(): Result<
  TradeIntegrityDiagnostics,
  SourceError
> {
  const files = listNotes(TRANSACTIONS_DIR);
  if (!files.ok) return files;

  const findings = new Map<string, TradeIntegrityDiagnostic>();

  for (const file of files.value) {
    const note = readNote(file);
    if (!note.ok) return err(note.error);

    const fm = note.value.frontmatter;
    if (!isTransaction(fm)) continue;

    const finding = tradeIntegrityFinding(fm);
    if (finding) findings.set(finding.id, finding);
  }

  return ok(sortedTradeIntegrityDiagnostics(findings));
}

/**
 * Get daily portfolio snapshots since a given date.
 *
 * Parses all snapshot notes and filters by date. Returns snapshots
 * sorted ascending by date. An empty array means no snapshots found
 * (not an error).
 */
export function getDailySnapshots(
  since: string,
): Result<SnapshotPoint[], SourceError> {
  const files = listNotes(SNAPSHOTS_DIR);
  if (!files.ok) return files;

  const results: SnapshotPoint[] = [];

  for (const f of files.value) {
    const note = readNote(f);
    if (!note.ok) continue;

    if (!isSnapshot(note.value.frontmatter)) continue;

    const parsed = parseSnapshot(note.value);
    if (parsed.ok && parsed.value.date >= since) {
      results.push(parsed.value);
    }
  }

  // Sort ascending by date
  results.sort((a, b) => a.date.localeCompare(b.date));

  return ok(results);
}
