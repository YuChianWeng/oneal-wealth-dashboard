import "server-only";

import { createHash } from "node:crypto";

import { assertServerOnly } from "@/lib/server-only";
import { computeInvestmentReconciliation } from "@/lib/analytics/cash-reconciliation";
import {
  loanInvestmentPerformance,
  type LoanInvestmentPerformance,
} from "@/lib/data/loan-investment-repository";
import { listAllTrades } from "@/lib/data/portfolio-repository";
import { financeSettlements } from "@/lib/data/finance-repository";
import type { TradeRecord } from "@/lib/schemas/portfolio";
import { SourceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import {
  InvestmentReconciliationSchema,
  type InvestmentReconciliation,
} from "@/lib/schemas/reconciliation";

assertServerOnly();

function publicTradeId(internalId: string): string {
  const digest = createHash("sha256").update(internalId, "utf8").digest("hex");
  return `trade-${digest}`;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

export interface InvestmentReconciliationInsightState {
  reconciliation: InvestmentReconciliation;
  strategyEquationDelta: number;
}

type LoanInvestmentPoint = LoanInvestmentPerformance["points"][number];
type ReconciliationPoint = LoanInvestmentPoint & {
  confirmedCash: number;
  cashAsOfDate: string;
  brokerageMarketValue: number;
};

function isReconciliationPoint(
  point: LoanInvestmentPoint | undefined,
): point is ReconciliationPoint {
  return Boolean(
    point &&
      point.confirmedCash !== null &&
      point.cashAsOfDate !== null &&
      point.brokerageMarketValue !== null,
  );
}

function reconciliationPoint(
  performance: LoanInvestmentPerformance,
): Result<ReconciliationPoint, SourceError> {
  const point = [...performance.points]
    .reverse()
    .find((candidate) => !candidate.isSeed);
  if (!isReconciliationPoint(point)) {
    return err(
      new SourceError(
        "Investment reconciliation source is unavailable",
        "RECONCILIATION_SOURCE_UNAVAILABLE",
      ),
    );
  }
  return ok(point);
}

/**
 * Build the canonical reconciliation and its internal audit state from one
 * read of each auditable source. Raw vault paths and frontmatter never cross
 * this boundary.
 */
export function investmentReconciliationInsightStateFromSources(
  performance: LoanInvestmentPerformance,
  trades: TradeRecord[],
  financeSettledKeys?: ReadonlySet<string>,
): Result<InvestmentReconciliationInsightState, SourceError> {
  const pointResult = reconciliationPoint(performance);
  if (!pointResult.ok) return pointResult;
  const point = pointResult.value;

  try {
    const computed = computeInvestmentReconciliation({
      valuationDate: point.date,
      confirmedCash: point.confirmedCash,
      cashAsOfDate: point.cashAsOfDate,
      holdingsMarketValue: point.brokerageMarketValue,
      trades: trades.map((trade) => ({
        id: publicTradeId(trade.id),
        symbol: trade.symbol,
        side: trade.side,
        tradeDate: trade.date,
        settlementDate: trade.settlementDate ?? null,
        netCashflow: trade.netCashflow,
      })),
      ...(financeSettledKeys !== undefined && financeSettledKeys.size > 0
        ? { financeSettledTradeIds: financeSettledKeys }
        : {}),
    });

    const warnings = [...computed.warnings];
    // Only trades still requiring cash treatment are pending. A
    // finance-settled trade has an explicit settlement ledger entry and must
    // not inflate the snapshot's pending trade count.
    const pendingCount = computed.pendingSettlements.filter(
      (settlement) =>
        settlement.status === "pending" || settlement.status === "overdue",
    ).length;
    const checks: Array<[string, number | null, number]> = [
      [
        "pending trade cash adjustment",
        point.pendingTradeCashAdjustment,
        computed.pendingTradeCashAdjustment,
      ],
      [
        "effective cash value",
        point.effectiveCashValue,
        computed.effectiveCashValue,
      ],
      ["strategy value", point.strategyValue, computed.strategyValue],
    ];
    for (const [label, snapshotValue, computedValue] of checks) {
      if (
        snapshotValue === null ||
        !nearlyEqual(snapshotValue, computedValue)
      ) {
        warnings.push(
          `Snapshot ${label} does not match transaction reconciliation`,
        );
      }
    }
    if (point.pendingTradeCount !== pendingCount) {
      warnings.push(
        "Snapshot pending trade count does not match transaction reconciliation",
      );
    }
    if (point.cashAsOfQuality !== "confirmed-explicit-event") {
      warnings.push(
        "Cash freshness is inferred rather than explicitly confirmed",
      );
    }
    warnings.sort((left, right) => left.localeCompare(right));

    const parsed = InvestmentReconciliationSchema.safeParse({
      ...computed,
      cashAsOfSource: point.cashAsOfSource,
      cashAsOfQuality: point.cashAsOfQuality,
      status: warnings.length > 0 ? "attention" : computed.status,
      warnings,
    });
    if (!parsed.success) {
      return err(
        new SourceError(
          "Investment reconciliation data is invalid",
          "RECONCILIATION_DATA_INVALID",
          parsed.error,
        ),
      );
    }
    return ok({
      reconciliation: parsed.data,
      strategyEquationDelta: point.strategyValue - parsed.data.strategyValue,
    });
  } catch (cause) {
    return err(
      new SourceError(
        "Investment reconciliation could not be computed",
        "RECONCILIATION_COMPUTE_FAILED",
        cause,
      ),
    );
  }
}

function loadInvestmentReconciliationInsightState(): Result<
  InvestmentReconciliationInsightState,
  SourceError
> {
  const performanceResult = loanInvestmentPerformance();
  if (!performanceResult.ok) return performanceResult;
  const pointResult = reconciliationPoint(performanceResult.value);
  if (!pointResult.ok) return pointResult;
  const tradesResult = listAllTrades();
  if (!tradesResult.ok) return tradesResult;

  // The T+2 runner stores idempotency keys as
  // "tplus2-order:{broker}:{orderId}". Strip the runner prefix and hash the
  // remaining trade identity using the same public-ID boundary as trades.
  let financeSettledKeys: Set<string> | undefined;
  const settlementsResult = financeSettlements();
  if (settlementsResult.ok && settlementsResult.value.length > 0) {
    financeSettledKeys = new Set(
      settlementsResult.value.map((row) => {
        const identity = row.idempotency_key.startsWith("tplus2-")
          ? row.idempotency_key.slice("tplus2-".length)
          : row.idempotency_key;
        return publicTradeId(identity);
      }),
    );
  }

  return investmentReconciliationInsightStateFromSources(
    performanceResult.value,
    tradesResult.value,
    financeSettledKeys,
  );
}

/** Return the existing public reconciliation model without internal audit state. */
export function investmentReconciliation(): Result<
  InvestmentReconciliation,
  SourceError
> {
  const result = loadInvestmentReconciliationInsightState();
  if (!result.ok) return result;
  return ok(result.value.reconciliation);
}

/** Return typed reconciliation audit state for the Insights layer. */
export function investmentReconciliationInsightState(): Result<
  InvestmentReconciliationInsightState,
  SourceError
> {
  return loadInvestmentReconciliationInsightState();
}
