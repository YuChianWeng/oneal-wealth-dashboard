import "server-only";

import { config } from "@/lib/config";
import { benchmarkSeries } from "@/lib/data/benchmark-repository";
import { loanInvestmentPerformance } from "@/lib/data/loan-investment-repository";
import { loadTradeInsightSources } from "@/lib/data/portfolio-repository";
import { investmentReconciliationInsightStateFromSources } from "@/lib/data/reconciliation-repository";
import { assertServerOnly } from "@/lib/server-only";
import type { InsightContext } from "@/lib/analytics/insights";

assertServerOnly();

export type PhaseOneInsightContext = Pick<
  InsightContext,
  | "reconciliation"
  | "tradeIntegrity"
  | "financing"
  | "benchmark0050"
  | "cashStaleAfterDays"
>;

/**
 * Compose the typed, public-safe inputs used by Phase 1 insight rules.
 * Source Result failures are represented as omissions or safe source states;
 * raw errors, paths, and complete repository models never cross this boundary.
 */
export function loadPhaseOneInsightContext(now: Date): PhaseOneInsightContext {
  const financingResult = loanInvestmentPerformance();
  const tradeSourcesResult = loadTradeInsightSources();
  const reconciliationResult =
    financingResult.ok &&
    tradeSourcesResult.ok &&
    tradeSourcesResult.value.trades.ok
      ? investmentReconciliationInsightStateFromSources(
          financingResult.value,
          tradeSourcesResult.value.trades.value,
        )
      : null;
  const benchmarkResult = benchmarkSeries("0050.TW", now.toISOString());

  const reconciliation =
    reconciliationResult && reconciliationResult.ok
      ? {
          cashAsOfDate: reconciliationResult.value.reconciliation.cashAsOfDate,
          pendingSettlements:
            reconciliationResult.value.reconciliation.pendingSettlements.map(
              ({ id, symbol, status }) => ({ id, symbol, status }),
            ),
          strategyEquationDelta:
            reconciliationResult.value.strategyEquationDelta,
        }
      : undefined;

  const tradeIntegrity = tradeSourcesResult.ok
    ? {
        missingNetCashflow:
          tradeSourcesResult.value.tradeIntegrity.missingNetCashflow.map(
            ({ id, symbol }) => ({ id, symbol }),
          ),
      }
    : undefined;

  const economics = financingResult.ok ? financingResult.value.economics : null;
  const financing = economics
    ? { status: economics.status, statusReason: null }
    : undefined;

  const benchmark0050 = benchmarkResult.ok
    ? {
        sourceStatus: "available" as const,
        freshness: benchmarkResult.value.freshness,
        latestDate: benchmarkResult.value.latestDate,
        expectedLatestDate: benchmarkResult.value.expectedLatestDate,
      }
    : {
        sourceStatus:
          benchmarkResult.error.code === "BENCHMARK_SOURCE_UNAVAILABLE"
            ? ("missing" as const)
            : ("invalid" as const),
        freshness: "unavailable" as const,
        latestDate: null,
        expectedLatestDate: null,
      };

  return {
    ...(reconciliation ? { reconciliation } : {}),
    ...(tradeIntegrity ? { tradeIntegrity } : {}),
    ...(financing ? { financing } : {}),
    benchmark0050,
    cashStaleAfterDays: config.insightCashStaleDays,
  };
}
