import "server-only";

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

/**
 * Convert a raw position note into a validated PositionSummary.
 */
function parsePosition(note: RawNote): Result<PositionSummary, SourceError> {
  const fm = note.frontmatter;
  const symbol = String(fm.symbol ?? fm.Symbol ?? "").trim();

  if (!symbol) {
    return err(
      new SourceError(
        "Position note missing required symbol field",
        "VAULT_MISSING_SYMBOL",
      ),
    );
  }

  const rawPosition = {
    symbol,
    name: String(fm.name ?? fm.Name ?? symbol),
    shares: Number(fm.shares ?? fm.Shares ?? 0),
    avgCost: Number(fm.avgCost ?? fm["avg-cost"] ?? fm.AvgCost ?? 0),
    currentPrice:
      fm.currentPrice ?? fm["current-price"] ?? fm.CurrentPrice ?? null,
    marketValue: fm.marketValue ?? fm["market-value"] ?? fm.MarketValue ?? null,
    unrealizedPnl:
      fm.unrealizedPnl ?? fm["unrealized-pnl"] ?? fm.UnrealizedPnl ?? null,
    unrealizedPnlPct:
      fm.unrealizedPnlPct ??
      fm["unrealized-pnl-pct"] ??
      fm.UnrealizedPnlPct ??
      null,
    sector: fm.sector ?? fm.Sector ?? null,
    theme: fm.theme ?? fm.Theme ?? null,
    conviction: fm.conviction ?? fm.Conviction ?? null,
    status: fm.status ?? fm.Status ?? "open",
    lastChecked:
      fm.lastChecked ?? fm["last-checked"] ?? fm.LastChecked ?? fm.date ?? null,
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

/**
 * Convert a raw transaction note into a validated TradeRecord.
 */
function parseTrade(note: RawNote): Result<TradeRecord, SourceError> {
  const fm = note.frontmatter;
  const symbol = String(fm.symbol ?? fm.Symbol ?? "").trim();

  if (!symbol) {
    return err(
      new SourceError(
        "Transaction note missing required symbol field",
        "VAULT_MISSING_SYMBOL",
      ),
    );
  }

  const rawTrade = {
    id: note.path,
    date: String(fm.tradeDate ?? fm["trade-date"] ?? fm.date ?? ""),
    symbol,
    name: String(fm.name ?? fm.Name ?? symbol),
    side: String(fm.side ?? fm.Side ?? "").toLowerCase(),
    shares: Number(fm.shares ?? fm.Shares ?? 0),
    price: Number(fm.price ?? fm.Price ?? 0),
    grossAmount: fm.grossAmount ?? fm["gross-amount"] ?? undefined,
    feeTax: fm.feeTax ?? fm["fee-tax"] ?? undefined,
    netCashflow: fm.netCashflow ?? fm["net-cashflow"] ?? undefined,
    reason: fm.reason ?? fm.Reason ?? null,
    strategy: fm.strategy ?? fm.Strategy ?? null,
    broker: fm.broker ?? fm.Broker ?? null,
    status: fm.status ?? fm.Status ?? null,
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
  const date = String(fm.date ?? fm.Date ?? "");

  const rawSnapshot = {
    date,
    totalValue: Number(fm.totalValue ?? fm["total-value"] ?? 0),
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
    if (!note.ok) continue;

    if (!isTransaction(note.value.frontmatter)) continue;

    const parsed = parseTrade(note.value);
    if (parsed.ok) {
      results.push(parsed.value);
    }
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
    if (!note.ok) continue;

    if (!isTransaction(note.value.frontmatter)) continue;

    const parsed = parseTrade(note.value);
    if (parsed.ok) {
      results.push(parsed.value);
    }
  }

  // Sort descending by date (newest first)
  results.sort((a, b) => b.date.localeCompare(a.date));

  return ok(results);
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
