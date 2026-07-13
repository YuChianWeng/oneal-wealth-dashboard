import "server-only";

import { assertServerOnly } from "@/lib/server-only";
import { computeInvestmentReconciliation } from "@/lib/analytics/cash-reconciliation";
import { loanInvestmentPerformance } from "@/lib/data/loan-investment-repository";
import { listAllTrades } from "@/lib/data/portfolio-repository";
import { SourceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import {
  InvestmentReconciliationSchema,
  type InvestmentReconciliation,
} from "@/lib/schemas/reconciliation";

assertServerOnly();

function publicTradeId(internalId: string): string {
  const basename = internalId.split("/").pop() ?? internalId;
  return basename.replace(/\.md$/i, "");
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

/**
 * Build the canonical investment reconciliation read model from auditable,
 * read-only sources. Raw vault paths and frontmatter never cross this boundary.
 */
export function investmentReconciliation(): Result<
  InvestmentReconciliation,
  SourceError
> {
  const performanceResult = loanInvestmentPerformance();
  if (!performanceResult.ok) return performanceResult;

  const point = [...performanceResult.value.points]
    .reverse()
    .find((candidate) => !candidate.isSeed);
  if (
    !point ||
    point.confirmedCash === null ||
    point.cashAsOfDate === null ||
    point.brokerageMarketValue === null
  ) {
    return err(
      new SourceError(
        "Investment reconciliation source is unavailable",
        "RECONCILIATION_SOURCE_UNAVAILABLE",
      ),
    );
  }

  const tradesResult = listAllTrades();
  if (!tradesResult.ok) return tradesResult;

  try {
    const computed = computeInvestmentReconciliation({
      valuationDate: point.date,
      confirmedCash: point.confirmedCash,
      cashAsOfDate: point.cashAsOfDate,
      holdingsMarketValue: point.brokerageMarketValue,
      trades: tradesResult.value.map((trade) => ({
        id: publicTradeId(trade.id),
        symbol: trade.symbol,
        side: trade.side,
        tradeDate: trade.date,
        settlementDate: trade.settlementDate ?? null,
        netCashflow: trade.netCashflow,
      })),
    });

    const warnings = [...computed.warnings];
    const pendingCount = computed.pendingSettlements.filter(
      (settlement) => settlement.status !== "covered-by-cash-snapshot",
    ).length;
    const checks: Array<[string, number | null, number]> = [
      [
        "pending trade cash adjustment",
        point.pendingTradeCashAdjustment,
        computed.pendingTradeCashAdjustment,
      ],
      ["effective cash value", point.effectiveCashValue, computed.effectiveCashValue],
      ["strategy value", point.strategyValue, computed.strategyValue],
    ];
    for (const [label, snapshotValue, computedValue] of checks) {
      if (snapshotValue === null || !nearlyEqual(snapshotValue, computedValue)) {
        warnings.push(`Snapshot ${label} does not match transaction reconciliation`);
      }
    }
    if (point.pendingTradeCount !== pendingCount) {
      warnings.push("Snapshot pending trade count does not match transaction reconciliation");
    }
    if (point.cashAsOfQuality !== "confirmed-explicit-event") {
      warnings.push("Cash freshness is inferred rather than explicitly confirmed");
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
    return ok(parsed.data);
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
