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
}

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
): InvestmentReconciliation {
  assertReconciliationInputs(input);

  const warnings: string[] = [];
  const settlements: PendingSettlement[] = [];

  for (const trade of input.trades) {
    const tradeId = warningTradeId(trade);
    if (!isIsoDate(trade.tradeDate)) {
      warnings.push(
        `Trade ${tradeId}: invalid tradeDate (${String(trade.tradeDate)})`,
      );
      continue;
    }

    // Future trades do not belong to this valuation. Historical trades remain
    // visible as covered audit items when a cash snapshot has absorbed them.
    if (trade.tradeDate > input.valuationDate) continue;

    if (
      typeof trade.netCashflow !== "number" ||
      !Number.isFinite(trade.netCashflow) ||
      trade.netCashflow === 0
    ) {
      warnings.push(`Trade ${tradeId}: missing or invalid netCashflow`);
      continue;
    }

    let settlementDate: string | null = trade.settlementDate ?? null;
    if (settlementDate !== null && !isIsoDate(settlementDate)) {
      warnings.push(`Trade ${tradeId}: invalid settlementDate`);
      settlementDate = null;
    } else if (settlementDate !== null && settlementDate < trade.tradeDate) {
      warnings.push(`Trade ${tradeId}: settlementDate precedes tradeDate`);
      settlementDate = null;
    }

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

    const coveredByCashSnapshot = input.cashAsOfDate >= trade.tradeDate;
    const overdue =
      !coveredByCashSnapshot &&
      settlementDate !== null &&
      settlementDate < input.valuationDate;
    const status: PendingSettlement["status"] = coveredByCashSnapshot
      ? "covered-by-cash-snapshot"
      : overdue
        ? "overdue"
        : "pending";
    if (overdue) {
      warnings.push(
        `Trade ${tradeId}: settlement overdue as of ${input.valuationDate}`,
      );
    }

    const calendarAge = twseTradingDayAge(trade.tradeDate, input.valuationDate);
    const ageTradingDays = calendarAge ?? fallbackAge(trade);
    if (ageTradingDays === null) {
      warnings.push(`Trade ${tradeId}: trading-day age unavailable`);
      continue;
    }

    settlements.push({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      tradeDate: trade.tradeDate,
      settlementDate,
      netCashflow: trade.netCashflow,
      effectiveCashAdjustment: coveredByCashSnapshot ? 0 : normalizedAdjustment,
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
