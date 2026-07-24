import { describe, expect, it } from "vitest";
import { computeLoanInvestmentEconomics } from "@/lib/analytics/loan-investment-performance";

const baseInput = () => ({
  grossStrategyValue: 205_000,
  initialPrincipal: 200_000,
  annualLoanRate: 0.0375,
  costAsOfDate: "2026-07-12",
  currentAccruedInterest: 587,
  estimatedDailyAdjustment: 20,
  interestBaselineDate: "2026-06-20",
  interestBaselineAmount: 135,
  linkedInterestPayments: [] as number[] | null,
});

describe("computeLoanInvestmentEconomics", () => {
  it("computes confirmed gross and net returns without subtracting principal twice", () => {
    const result = computeLoanInvestmentEconomics(baseInput());

    expect(result).toEqual({
      grossStrategyValue: 205_000,
      grossReturnPct: 2.5,
      financingCost: 472,
      netStrategyValue: 204_528,
      netReturnPct: 2.264,
      annualLoanRate: 0.0375,
      breakEvenAnnualReturnPct: 3.75,
      costAsOfDate: "2026-07-12",
      status: "confirmed",
      statusReason: null,
    });
  });

  it("supports a confirmed zero financing cost", () => {
    const result = computeLoanInvestmentEconomics({
      ...baseInput(),
      currentAccruedInterest: 100,
      estimatedDailyAdjustment: 0,
      interestBaselineAmount: 100,
    });

    expect(result.financingCost).toBe(0);
    expect(result.netStrategyValue).toBe(205_000);
    expect(result.netReturnPct).toBe(2.5);
    expect(result.status).toBe("confirmed");
  });

  it("adds linked interest payments to current attributable accrual", () => {
    const result = computeLoanInvestmentEconomics({
      ...baseInput(),
      linkedInterestPayments: [200, 50],
    });

    expect(result.financingCost).toBe(722);
    expect(result.netStrategyValue).toBe(204_278);
  });

  it("marks accrual below baseline as partial and never creates negative cost", () => {
    const result = computeLoanInvestmentEconomics({
      ...baseInput(),
      currentAccruedInterest: 100,
      estimatedDailyAdjustment: 0,
      interestBaselineAmount: 135,
    });

    expect(result.financingCost).toBe(0);
    expect(result.netStrategyValue).toBe(205_000);
    expect(result.status).toBe("partial");
    expect(result.statusReason).toMatch(/below the confirmed baseline/);
  });

  it("uses an explicit current-interest estimate when the audited baseline is missing", () => {
    const result = computeLoanInvestmentEconomics({
      ...baseInput(),
      grossStrategyValue: 184_891,
      costAsOfDate: "2026-07-18",
      interestBaselineDate: null,
      interestBaselineAmount: null,
      linkedInterestPayments: null,
      financingCostEstimate: 710,
    });

    expect(result.financingCost).toBe(710);
    expect(result.netStrategyValue).toBe(184_181);
    expect(result.netReturnPct).toBe(-7.9095);
    expect(result.status).toBe("partial");
    expect(result.statusReason).toMatch(
      /current policy-loan interest estimate/,
    );
  });

  it("hides net values when the baseline is missing", () => {
    const result = computeLoanInvestmentEconomics({
      ...baseInput(),
      interestBaselineDate: null,
      interestBaselineAmount: null,
    });

    expect(result.grossReturnPct).toBe(2.5);
    expect(result.financingCost).toBeNull();
    expect(result.netStrategyValue).toBeNull();
    expect(result.netReturnPct).toBeNull();
    expect(result.breakEvenAnnualReturnPct).toBe(3.75);
    expect(result.status).toBe("needs-review");
    expect(result.statusReason).toMatch(/baseline/);
  });

  it("hides net values when linked interest payments have not been reviewed", () => {
    const result = computeLoanInvestmentEconomics({
      ...baseInput(),
      linkedInterestPayments: null,
    });

    expect(result.financingCost).toBeNull();
    expect(result.netReturnPct).toBeNull();
    expect(result.breakEvenAnnualReturnPct).toBe(3.75);
    expect(result.status).toBe("needs-review");
    expect(result.statusReason).toMatch(/interest payments/);
  });

  it.each([
    { grossStrategyValue: -1 },
    { initialPrincipal: 0 },
    { annualLoanRate: -0.1 },
    { currentAccruedInterest: -1 },
    { estimatedDailyAdjustment: -1 },
    { interestBaselineAmount: -1 },
    { linkedInterestPayments: [-1] },
  ])("rejects invalid non-negative input: %o", (override) => {
    expect(() =>
      computeLoanInvestmentEconomics({ ...baseInput(), ...override }),
    ).toThrow();
  });
});
