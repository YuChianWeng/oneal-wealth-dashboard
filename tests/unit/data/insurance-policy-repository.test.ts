import { describe, expect, it, vi } from "vitest";

const { fixtureRoot } = vi.hoisted(() => ({
  fixtureRoot: `${process.cwd()}/lib/data/__fixtures__/vault`,
}));

vi.mock("@/lib/config", () => ({
  config: { obsidianVaultPath: fixtureRoot },
}));
vi.mock("@/lib/server-only", () => ({ assertServerOnly: () => undefined }));

import {
  parseInsurancePolicyFrontmatter,
  savingsPolicySummary,
} from "@/lib/data/insurance-policy-repository";

const validSource = {
  status: "active",
  policy_type: "儲蓄險",
  valuation_date: "2026-07-12",
  scheduled_surrender_value: 926_925,
  net_surrender_value: 726_318,
  policy_loan_principal: 200_000,
  policy_loan_accrued_interest: 587,
  policy_loan_estimated_daily_adjustment: 20,
  policy_loan_total_deduction: 200_607,
  policy_loan_rate: 0.0375,
  policy_cash_value_growth_rate: 0.0225,
  next_interest_due: "2026-12-30",
  interest_capitalization_rule: "未付利息超過一年才併入本金",
  valuation_status: "estimated-reconciled",
};

describe("insurance policy financing baseline", () => {
  it("fails closed when the production-shaped policy has no confirmed baseline", () => {
    const result = savingsPolicySummary();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.loanInvestmentInterestBaselineDate).toBeNull();
    expect(result.value.loanInvestmentInterestBaselineAmount).toBeNull();
    expect(result.value.financingCostStatus).toBe("needs-review");
  });

  it("maps a complete baseline pair as confirmed", () => {
    const result = parseInsurancePolicyFrontmatter({
      ...validSource,
      loan_investment_interest_baseline_date: "2026-06-20",
      loan_investment_interest_baseline_amount: 135,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.loanInvestmentInterestBaselineDate).toBe("2026-06-20");
    expect(result.value.loanInvestmentInterestBaselineAmount).toBe(135);
    expect(result.value.financingCostStatus).toBe("confirmed");
  });

  it("maps an explicit current-interest estimate without marking the baseline confirmed", () => {
    const result = parseInsurancePolicyFrontmatter({
      ...validSource,
      loan_investment_financing_cost_estimate: 710,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.financingCostEstimate).toBe(710);
    expect(result.value.financingCostStatus).toBe("needs-review");
  });

  it("rejects a partial baseline pair without guessing the missing value", () => {
    const result = parseInsurancePolicyFrontmatter({
      ...validSource,
      loan_investment_interest_baseline_date: "2026-06-20",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.loanInvestmentInterestBaselineDate).toBeNull();
    expect(result.value.loanInvestmentInterestBaselineAmount).toBeNull();
    expect(result.value.financingCostStatus).toBe("needs-review");
  });

  it("rejects negative baseline amounts", () => {
    const result = parseInsurancePolicyFrontmatter({
      ...validSource,
      loan_investment_interest_baseline_date: "2026-06-20",
      loan_investment_interest_baseline_amount: -1,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SOURCE_VALIDATION_ERROR");
  });
});
