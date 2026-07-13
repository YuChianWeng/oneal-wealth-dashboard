import { z } from "zod";

const nonNegativeMoney = z.number().finite().nonnegative();

const LoanInvestmentEconomicsInputSchema = z
  .object({
    grossStrategyValue: nonNegativeMoney,
    initialPrincipal: z.number().finite().positive(),
    annualLoanRate: z.number().finite().nonnegative(),
    costAsOfDate: z.string().date(),
    currentAccruedInterest: nonNegativeMoney,
    estimatedDailyAdjustment: nonNegativeMoney,
    interestBaselineDate: z.string().date().nullable(),
    interestBaselineAmount: nonNegativeMoney.nullable(),
    linkedInterestPayments: z.array(nonNegativeMoney).nullable(),
  })
  .strict();

export const LoanInvestmentEconomicsSchema = z
  .object({
    grossStrategyValue: nonNegativeMoney,
    grossReturnPct: z.number().finite(),
    financingCost: nonNegativeMoney.nullable(),
    netStrategyValue: z.number().finite().nullable(),
    netReturnPct: z.number().finite().nullable(),
    annualLoanRate: z.number().finite().nonnegative(),
    breakEvenAnnualReturnPct: z.number().finite().nonnegative().nullable(),
    costAsOfDate: z.string().date().nullable(),
    status: z.enum(["confirmed", "partial", "needs-review"]),
    statusReason: z.string().min(1).nullable(),
  })
  .strict();

export type LoanInvestmentEconomics = z.infer<
  typeof LoanInvestmentEconomicsSchema
>;
export type LoanInvestmentEconomicsInput = z.input<
  typeof LoanInvestmentEconomicsInputSchema
>;

function round(value: number, decimals = 6): number {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function unavailable(
  input: z.output<typeof LoanInvestmentEconomicsInputSchema>,
  grossReturnPct: number,
  reason: string,
): LoanInvestmentEconomics {
  return LoanInvestmentEconomicsSchema.parse({
    grossStrategyValue: input.grossStrategyValue,
    grossReturnPct,
    financingCost: null,
    netStrategyValue: null,
    netReturnPct: null,
    annualLoanRate: input.annualLoanRate,
    breakEvenAnnualReturnPct: round(input.annualLoanRate * 100),
    costAsOfDate: input.costAsOfDate,
    status: "needs-review",
    statusReason: reason,
  });
}

/**
 * Computes economics for a loan-funded strategy without touching source data.
 * A null payment list means payment linkage has not been audited; it is not zero.
 */
export function computeLoanInvestmentEconomics(
  rawInput: LoanInvestmentEconomicsInput,
): LoanInvestmentEconomics {
  const input = LoanInvestmentEconomicsInputSchema.parse(rawInput);
  const grossReturnPct = round(
    ((input.grossStrategyValue - input.initialPrincipal) /
      input.initialPrincipal) *
      100,
  );

  const hasCompleteBaseline =
    input.interestBaselineDate !== null &&
    input.interestBaselineAmount !== null;
  if (!hasCompleteBaseline) {
    return unavailable(
      input,
      grossReturnPct,
      "Interest baseline requires a confirmed date and amount",
    );
  }
  if (input.interestBaselineDate! > input.costAsOfDate) {
    throw new Error("Interest baseline date cannot be after cost as-of date");
  }
  if (input.linkedInterestPayments === null) {
    return unavailable(
      input,
      grossReturnPct,
      "Linked interest payments have not been reviewed",
    );
  }

  const payments = input.linkedInterestPayments.reduce(
    (total, payment) => total + payment,
    0,
  );
  const rawCost =
    payments +
    input.currentAccruedInterest +
    input.estimatedDailyAdjustment -
    input.interestBaselineAmount!;
  const belowBaseline = rawCost < 0;
  const financingCost = round(Math.max(0, rawCost), 2);
  const netStrategyValue = round(input.grossStrategyValue - financingCost, 2);
  const netReturnPct = round(
    ((netStrategyValue - input.initialPrincipal) / input.initialPrincipal) * 100,
  );

  return LoanInvestmentEconomicsSchema.parse({
    grossStrategyValue: input.grossStrategyValue,
    grossReturnPct,
    financingCost,
    netStrategyValue,
    netReturnPct,
    annualLoanRate: input.annualLoanRate,
    breakEvenAnnualReturnPct: round(input.annualLoanRate * 100),
    costAsOfDate: input.costAsOfDate,
    status: belowBaseline ? "partial" : "confirmed",
    statusReason: belowBaseline
      ? "Current cumulative interest is below the confirmed baseline"
      : null,
  });
}
