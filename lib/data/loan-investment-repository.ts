import "server-only";

import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { balanceSnapshots } from "@/lib/data/finance-repository";
import { getDailySnapshots } from "@/lib/data/portfolio-repository";

assertServerOnly();

/**
 * The user's approved loan-investment tracking convention. The seed point is
 * intentionally separate from the first observed account snapshot: it records
 * the principal deployed before the 2026-06-21 snapshot, rather than fabricating
 * an earlier cash/brokerage allocation.
 */
const START_DATE = "2026-06-20";
const FIRST_OBSERVATION_DATE = "2026-06-21";
const INITIAL_PRINCIPAL = 200_000;
const CASH_ACCOUNT = "CathayBank";
const BROKERAGE_ACCOUNT = "Brokerage";

export interface LoanInvestmentPoint {
  date: string;
  strategyValue: number;
  strategyReturnPct: number;
  taiexClose: number | null;
  taiexReturnPct: number | null;
  taiexSnapshotDate: string | null;
  isSeed: boolean;
}

export interface LoanInvestmentPerformance {
  startDate: string;
  firstObservationDate: string;
  initialPrincipal: number;
  strategyLabel: string;
  benchmarkLabel: string;
  points: LoanInvestmentPoint[];
}

function latestBenchmarkAtOrBefore(
  snapshots: Array<{ date: string; benchmarkClose: number | null }>,
  date: string,
) {
  let latest: { date: string; benchmarkClose: number | null } | null = null;
  for (const snapshot of snapshots) {
    if (
      snapshot.date <= date &&
      snapshot.benchmarkClose &&
      snapshot.benchmarkClose > 0
    ) {
      latest = snapshot;
    }
  }
  return latest;
}

/**
 * Calculates the performance of the NT$200,000 policy-loan investment pool.
 * It is deliberately separate from whole-portfolio TWR: this pool includes
 * Cathay settlement cash plus brokerage market value, with a fixed principal
 * seed and no fabricated historical decomposition before 2026-06-21.
 */
export function loanInvestmentPerformance(): Result<
  LoanInvestmentPerformance,
  SourceError
> {
  const cashResult = balanceSnapshots(CASH_ACCOUNT, FIRST_OBSERVATION_DATE);
  if (!cashResult.ok) return cashResult;
  const brokerageResult = balanceSnapshots(
    BROKERAGE_ACCOUNT,
    FIRST_OBSERVATION_DATE,
  );
  if (!brokerageResult.ok) return brokerageResult;
  const portfolioResult = getDailySnapshots("2026-06-01");
  if (!portfolioResult.ok) return portfolioResult;

  const cashByDate = new Map(
    cashResult.value.map((point) => [point.date, point.netWorth]),
  );
  const brokerageByDate = new Map(
    brokerageResult.value.map((point) => [point.date, point.netWorth]),
  );
  const benchmarkSnapshots = portfolioResult.value.map((snapshot) => ({
    date: snapshot.date,
    benchmarkClose: snapshot.benchmarkClose ?? null,
  }));
  const baseBenchmark = latestBenchmarkAtOrBefore(
    benchmarkSnapshots,
    START_DATE,
  );

  if (!baseBenchmark?.benchmarkClose) {
    return err(
      new SourceError(
        "Loan-investment benchmark is unavailable",
        "SOURCE_NOT_FOUND",
      ),
    );
  }

  const observedDates = [...cashByDate.keys()]
    .filter((date) => brokerageByDate.has(date))
    .sort();

  const points: LoanInvestmentPoint[] = [
    {
      date: START_DATE,
      strategyValue: INITIAL_PRINCIPAL,
      strategyReturnPct: 0,
      taiexClose: baseBenchmark.benchmarkClose,
      taiexReturnPct: 0,
      taiexSnapshotDate: baseBenchmark.date,
      isSeed: true,
    },
  ];

  for (const date of observedDates) {
    const strategyValue =
      (cashByDate.get(date) ?? 0) + (brokerageByDate.get(date) ?? 0);
    const benchmark = latestBenchmarkAtOrBefore(benchmarkSnapshots, date);
    points.push({
      date,
      strategyValue,
      strategyReturnPct: (strategyValue / INITIAL_PRINCIPAL - 1) * 100,
      taiexClose: benchmark?.benchmarkClose ?? null,
      taiexReturnPct: benchmark?.benchmarkClose
        ? (benchmark.benchmarkClose / baseBenchmark.benchmarkClose - 1) * 100
        : null,
      taiexSnapshotDate: benchmark?.date ?? null,
      isSeed: false,
    });
  }

  return ok({
    startDate: START_DATE,
    firstObservationDate: FIRST_OBSERVATION_DATE,
    initialPrincipal: INITIAL_PRINCIPAL,
    strategyLabel: "保單借款投資（國泰交割戶＋股票市值）",
    benchmarkLabel: "TAIEX 加權指數",
    points,
  });
}
