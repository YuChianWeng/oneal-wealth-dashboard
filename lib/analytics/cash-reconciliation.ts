/**
 * Pure investment cash reconciliation.
 *
 * This module intentionally performs no source reads. Callers adapt and
 * validate Finance/Vault records before passing their view-independent values
 * here; the result preserves confirmed cash while accounting for post-snapshot
 * trade receivables and payables.
 */

import type {
  InvestmentReconciliation,
  PendingSettlement,
} from "@/lib/schemas/reconciliation";
import {
  addTwseTradingDays,
  hasVerifiedTwseCalendar,
  isTwseTradingDay,
} from "@/lib/market/twse-calendar";

export interface CashReconciliationTrade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  tradeDate: string;
  settlementDate?: string | null;
  netCashflow?: unknown;
  /** Fallback for dates outside the checked-in TWSE calendar coverage. */
  ageTradingDays?: number;
}

export interface CashReconciliationInput {
  valuationDate: string;
  confirmedCash: number;
  cashAsOfDate: string;
  holdingsMarketValue: number;
  trades: readonly CashReconciliationTrade[];
  /** Trade IDs that have a confirmed finance settlement entry. */
  financeSettledTradeIds?: ReadonlySet<string>;
}

export type InvestmentReconciliationCore = Omit<
  InvestmentReconciliation,
  "cashAsOfSource" | "cashAsOfQuality"
>;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Count verified TWSE sessions strictly after trade date through valuation. */
function twseTradingDayAge(
  tradeDate: string,
  valuationDate: string,
): number | null {
  let cursor = shiftDate(tradeDate, 1);
  let age = 0;
  while (cursor <= valuationDate) {
    if (!hasVerifiedTwseCalendar(cursor)) return null;
    if (isTwseTradingDay(cursor)) age += 1;
    cursor = shiftDate(cursor, 1);
  }
  return age;
}

function fallbackAge(trade: CashReconciliationTrade): number | null {
  return typeof trade.ageTradingDays === "number" &&
    Number.isInteger(trade.ageTradingDays) &&
    trade.ageTradingDays >= 0
    ? trade.ageTradingDays
    : null;
}

function warningTradeId(trade: CashReconciliationTrade): string {
  return trade.id.trim() || "<unknown>";
}

function assertReconciliationInputs(input: CashReconciliationInput): void {
  if (!isIsoDate(input.valuationDate)) {
    throw new TypeError(`Invalid valuationDate: ${input.valuationDate}`);
  }
  if (!isIsoDate(input.cashAsOfDate)) {
    throw new TypeError(`Invalid cashAsOfDate: ${input.cashAsOfDate}`);
  }
  if (!Number.isFinite(input.confirmedCash)) {
    throw new TypeError("confirmedCash must be finite");
  }
  if (!Number.isFinite(input.holdingsMarketValue)) {
    throw new TypeError("holdingsMarketValue must be finite");
  }
  if (input.holdingsMarketValue < 0) {
    throw new TypeError("holdingsMarketValue must be nonnegative");
  }
  if (input.cashAsOfDate > input.valuationDate) {
    throw new TypeError("cashAsOfDate cannot be after valuationDate");
  }
}

function settlementOrder(
  left: PendingSettlement,
  right: PendingSettlement,
): number {
  return (
    left.tradeDate.localeCompare(right.tradeDate) ||
    left.id.localeCompare(right.id) ||
    left.symbol.localeCompare(right.symbol)
  );
}

export function computeInvestmentReconciliation(
  input: CashReconciliationInput,
): InvestmentReconciliationCore {
  assertReconciliationInputs(input);

  const warnings: string[] = [];
  const settlements: PendingSettlement[] = [];

  const tradeIdCounts = new Map<string, number>();
  for (const trade of input.trades) {
    const tradeId = warningTradeId(trade);
    tradeIdCounts.set(tradeId, (tradeIdCounts.get(tradeId) ?? 0) + 1);
  }
  const duplicateTradeIds = new Set(
    [...tradeIdCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([tradeId]) => tradeId),
  );
  for (const tradeId of duplicateTradeIds) {
    warnings.push(`Trade ${tradeId}: duplicate trade id; all copies excluded`);
  }

  for (const trade of input.trades) {
    const tradeId = warningTradeId(trade);
    if (duplicateTradeIds.has(tradeId)) continue;
    if (!isIsoDate(trade.tradeDate)) {
      warnings.push(
        `Trade ${tradeId}: invalid tradeDate (${String(trade.tradeDate)})`,
      );
      continue;
    }

    if (
      typeof trade.netCashflow !== "number" ||
      !Number.isFinite(trade.netCashflow) ||
      trade.netCashflow === 0
    ) {
      warnings.push(`Trade ${tradeId}: missing or invalid netCashflow`);
      continue;
    }

    const settlementDateWasProvided =
      trade.settlementDate !== null && trade.settlementDate !== undefined;
    let settlementDate: string | null = trade.settlementDate ?? null;
    if (settlementDate !== null && !isIsoDate(settlementDate)) {
      warnings.push(`Trade ${tradeId}: invalid settlementDate`);
      settlementDate = null;
    } else if (settlementDate !== null && settlementDate < trade.tradeDate) {
      warnings.push(`Trade ${tradeId}: settlementDate precedes tradeDate`);
      settlementDate = null;
    }

    // Validate every transaction before valuation filtering so malformed future
    // notes cannot disappear from a seemingly clean reconciliation.
    if (trade.tradeDate > input.valuationDate) continue;

    const normalizedAdjustment =
      trade.side === "sell"
        ? Math.abs(trade.netCashflow)
        : -Math.abs(trade.netCashflow);
    const signMatchesSide =
      (trade.side === "sell" && trade.netCashflow > 0) ||
      (trade.side === "buy" && trade.netCashflow < 0);
    if (!signMatchesSide) {
      warnings.push(`Trade ${tradeId}: netCashflow sign does not match side`);
    }

    const calendarAge = twseTradingDayAge(trade.tradeDate, input.valuationDate);
    const ageTradingDays = calendarAge ?? fallbackAge(trade);
    if (ageTradingDays === null) {
      warnings.push(`Trade ${tradeId}: trading-day age unavailable`);
    }

    const inferredSettlementDate =
      settlementDate === null ? addTwseTradingDays(trade.tradeDate, 2) : null;
    if (settlementDate === null && inferredSettlementDate === null) {
      warnings.push(
        `Trade ${tradeId}: settlementDate ${settlementDateWasProvided ? "invalid" : "missing"}; coverage unavailable`,
      );
    } else if (settlementDate === null && settlementDateWasProvided) {
      warnings.push(
        `Trade ${tradeId}: settlementDate invalid; coverage inferred as ${inferredSettlementDate}`,
      );
    }
    const cashCoverageDate = settlementDate ?? inferredSettlementDate;
    const settlementDateQuality: PendingSettlement["settlementDateQuality"] =
      settlementDate !== null
        ? "canonical"
        : inferredSettlementDate !== null
          ? "inferred-twse-t-plus-2"
          : "unavailable";
    const financeSettled =
      input.financeSettledTradeIds !== undefined &&
      input.financeSettledTradeIds.has(trade.id);
    const coveredByCashSnapshot =
      cashCoverageDate !== null && input.cashAsOfDate >= cashCoverageDate;
    const overdueByDate =
      cashCoverageDate !== null && cashCoverageDate < input.valuationDate;
    const overdueByAge =
      cashCoverageDate === null &&
      ageTradingDays !== null &&
      ageTradingDays > 2;
    const overdue =
      !financeSettled &&
      !coveredByCashSnapshot &&
      (overdueByDate || overdueByAge);
    let status: PendingSettlement["status"];
    let effectiveCashAdjustment: number;
    if (financeSettled) {
      status = "finance-settled";
      effectiveCashAdjustment = 0;
    } else if (coveredByCashSnapshot) {
      status = "covered-by-cash-snapshot";
      effectiveCashAdjustment = 0;
    } else if (overdue) {
      status = "overdue";
      effectiveCashAdjustment = normalizedAdjustment;
    } else {
      status = "pending";
      effectiveCashAdjustment = normalizedAdjustment;
    }
    if (overdue) {
      warnings.push(
        `Trade ${tradeId}: settlement overdue as of ${input.valuationDate}`,
      );
    }

    settlements.push({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      tradeDate: trade.tradeDate,
      settlementDate: cashCoverageDate,
      settlementDateQuality,
      netCashflow: trade.netCashflow,
      effectiveCashAdjustment,
      ageTradingDays,
      status,
    });
  }

  settlements.sort(settlementOrder);
  warnings.sort((left, right) => left.localeCompare(right));

  const pendingTradeCashAdjustment = settlements.reduce(
    (total, settlement) => total + settlement.effectiveCashAdjustment,
    0,
  );
  const effectiveCashValue = input.confirmedCash + pendingTradeCashAdjustment;
  const strategyValue = effectiveCashValue + input.holdingsMarketValue;

  return {
    valuationDate: input.valuationDate,
    confirmedCash: input.confirmedCash,
    cashAsOfDate: input.cashAsOfDate,
    pendingTradeCashAdjustment,
    effectiveCashValue,
    holdingsMarketValue: input.holdingsMarketValue,
    strategyValue,
    pendingSettlements: settlements,
    status:
      warnings.length > 0 ||
      settlements.some((settlement) => settlement.status === "overdue")
        ? "attention"
        : "reconciled",
    warnings,
  };
}
