import "server-only";

import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { listNotes, readNote } from "@/lib/data/vault-reader";
import { savingsPolicySummary } from "@/lib/data/insurance-policy-repository";
import {
  computeLoanInvestmentEconomics,
  type LoanInvestmentEconomics,
} from "@/lib/analytics/loan-investment-performance";

assertServerOnly();

const SNAPSHOTS_DIR = "Finance/Insurance/Loan Investment Snapshots";

export interface LoanInvestmentPoint {
  date: string;
  strategyValue: number;
  strategyReturnPct: number;
  taiexClose: number | null;
  taiexReturnPct: number | null;
  taiexSnapshotDate: string | null;
  isSeed: boolean;
  cashAsOfDate: string | null;
  confirmedCash: number | null;
  cashAsOfSource: string;
  cashAsOfQuality:
    | "confirmed-explicit-event"
    | "inferred-from-balance-entry"
    | "unavailable";
  pendingTradeCashAdjustment: number;
  pendingTradeCount: number;
  effectiveCashValue: number | null;
  brokerageMarketValue: number | null;
}

export interface LoanInvestmentPerformance {
  startDate: string;
  firstObservationDate: string;
  initialPrincipal: number;
  strategyLabel: string;
  benchmarkLabel: string;
  points: LoanInvestmentPoint[];
  economics: LoanInvestmentEconomics | null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Reads the single auditable daily loan-investment snapshot source written by
 * daily_growth_snapshots.py. Finance/Entries remains a real account-balance
 * source and is intentionally not rewritten by the market-close cron.
 */
export function loanInvestmentPerformance(): Result<
  LoanInvestmentPerformance,
  SourceError
> {
  const filesResult = listNotes(SNAPSHOTS_DIR);
  if (!filesResult.ok) return filesResult;

  const raw = [] as Array<{
    date: string;
    principal: number;
    strategyValue: number;
    strategyReturnPct: number;
    taiexClose: number | null;
    benchmarkDate: string | null;
    isSeed: boolean;
    cashAsOfDate: string | null;
    confirmedCash: number | null;
    cashAsOfSource: string;
    cashAsOfQuality: LoanInvestmentPoint["cashAsOfQuality"];
    pendingTradeCashAdjustment: number;
    pendingTradeCount: number;
    effectiveCashValue: number | null;
    brokerageMarketValue: number | null;
  }>;

  for (const path of filesResult.value) {
    const note = readNote(path);
    if (
      !note.ok ||
      String(note.value.frontmatter.type) !== "loan-investment-snapshot"
    )
      continue;
    const fm = note.value.frontmatter;
    const date = isoDate(fm.date);
    const principal = numberOrNull(fm.initial_principal);
    const strategyValue = numberOrNull(fm.strategy_value);
    const strategyReturnPct = numberOrNull(fm.strategy_return_pct);
    if (
      !date ||
      !principal ||
      strategyValue === null ||
      strategyReturnPct === null
    )
      continue;
    const cashAsOfDate = isoDate(fm.cash_as_of_date);
    const rawCashQuality = String(fm.cash_as_of_quality ?? "").trim();
    const cashAsOfQuality: LoanInvestmentPoint["cashAsOfQuality"] =
      rawCashQuality === "confirmed-explicit-event" ||
      rawCashQuality === "inferred-from-balance-entry"
        ? rawCashQuality
        : cashAsOfDate
          ? "inferred-from-balance-entry"
          : "unavailable";
    raw.push({
      date,
      principal,
      strategyValue,
      strategyReturnPct,
      taiexClose: numberOrNull(fm.benchmark_close),
      benchmarkDate: isoDate(fm.benchmark_snapshot_date),
      isSeed: fm.is_seed === true || fm.is_seed === "true",
      cashAsOfDate,
      confirmedCash: numberOrNull(fm.cash_balance),
      cashAsOfSource:
        String(fm.cash_as_of_source ?? "").trim() ||
        (cashAsOfDate ? "legacy-balance-entry" : "unavailable"),
      cashAsOfQuality,
      pendingTradeCashAdjustment:
        numberOrNull(fm.pending_trade_cash_adjustment) ?? 0,
      pendingTradeCount: Math.max(
        0,
        Math.trunc(numberOrNull(fm.pending_trade_count) ?? 0),
      ),
      effectiveCashValue: numberOrNull(fm.effective_cash_value),
      brokerageMarketValue: numberOrNull(fm.brokerage_market_value),
    });
  }

  raw.sort((a, b) => a.date.localeCompare(b.date));
  if (!raw.length) {
    return err(
      new SourceError(
        "Loan-investment snapshots are unavailable",
        "SOURCE_NOT_FOUND",
      ),
    );
  }

  const seed = raw.find((point) => point.isSeed) ?? raw[0];
  const baseTaiexClose = seed.taiexClose;
  if (!baseTaiexClose || baseTaiexClose <= 0) {
    return err(
      new SourceError(
        "Loan-investment benchmark is unavailable",
        "SOURCE_NOT_FOUND",
      ),
    );
  }

  const points: LoanInvestmentPoint[] = raw.map((point) => ({
    date: point.date,
    strategyValue: point.strategyValue,
    strategyReturnPct: point.strategyReturnPct,
    taiexClose: point.taiexClose,
    taiexReturnPct: point.taiexClose
      ? (point.taiexClose / baseTaiexClose - 1) * 100
      : null,
    taiexSnapshotDate: point.benchmarkDate,
    isSeed: point.isSeed,
    cashAsOfDate: point.cashAsOfDate,
    confirmedCash: point.confirmedCash,
    cashAsOfSource: point.cashAsOfSource,
    cashAsOfQuality: point.cashAsOfQuality,
    pendingTradeCashAdjustment: point.pendingTradeCashAdjustment,
    pendingTradeCount: point.pendingTradeCount,
    effectiveCashValue: point.effectiveCashValue,
    brokerageMarketValue: point.brokerageMarketValue,
  }));

  const firstObserved =
    points.find((point) => !point.isSeed)?.date ?? seed.date;
  const latestPoint = points.at(-1);
  const policyResult = savingsPolicySummary();
  let economics: LoanInvestmentEconomics | null = null;
  if (latestPoint && policyResult.ok) {
    try {
      economics = computeLoanInvestmentEconomics({
        grossStrategyValue: latestPoint.strategyValue,
        initialPrincipal: seed.principal,
        annualLoanRate: policyResult.value.loanRate,
        costAsOfDate: policyResult.value.valuationDate,
        currentAccruedInterest: policyResult.value.accruedInterest,
        estimatedDailyAdjustment:
          policyResult.value.estimatedDailyAdjustment,
        interestBaselineDate:
          policyResult.value.loanInvestmentInterestBaselineDate,
        interestBaselineAmount:
          policyResult.value.loanInvestmentInterestBaselineAmount,
        // The Finance row contract has no required policy/strategy linkage key.
        // Null means unaudited; it must never be interpreted as zero payments.
        linkedInterestPayments: null,
      });
    } catch (cause) {
      return err(
        new SourceError(
          "Loan-investment economics are invalid",
          "LOAN_INVESTMENT_ECONOMICS_INVALID",
          cause,
        ),
      );
    }
  }

  return ok({
    startDate: seed.date,
    firstObservationDate: firstObserved,
    initialPrincipal: seed.principal,
    strategyLabel: "保單借款投資（國泰交割戶＋股票市值）",
    benchmarkLabel: "TAIEX 加權指數",
    points,
    economics,
  });
}
