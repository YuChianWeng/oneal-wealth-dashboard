import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { config } from "@/lib/config";
import { SourceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import type { InsurancePolicyInfo } from "@/lib/schemas/finance";

const POLICY_RELATIVE_PATH = "Finance/Insurance/Policies/SavingsPolicy_2011.md";

const SourceSchema = z.object({
  status: z.string(),
  policy_type: z.string(),
  valuation_date: z.union([z.string(), z.date()]),
  scheduled_surrender_value: z.coerce.number().finite().nonnegative(),
  net_surrender_value: z.coerce.number().finite().nonnegative(),
  policy_loan_principal: z.coerce.number().finite().nonnegative(),
  policy_loan_accrued_interest: z.coerce.number().finite().nonnegative(),
  policy_loan_estimated_daily_adjustment: z.coerce
    .number()
    .finite()
    .nonnegative(),
  policy_loan_total_deduction: z.coerce.number().finite().nonnegative(),
  policy_loan_rate: z.coerce.number().finite().nonnegative(),
  policy_cash_value_growth_rate: z.coerce.number().finite().nonnegative(),
  next_interest_due: z.union([z.string(), z.date()]),
  interest_capitalization_rule: z.string(),
  valuation_status: z.string(),
});

function asDate(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

/** Returns the single explicitly allowlisted savings-policy view model. */
export function savingsPolicySummary(): Result<
  InsurancePolicyInfo,
  SourceError
> {
  try {
    const filePath = path.join(config.obsidianVaultPath, POLICY_RELATIVE_PATH);
    const root = path.resolve(config.obsidianVaultPath) + path.sep;
    if (!path.resolve(filePath).startsWith(root) || !fs.existsSync(filePath)) {
      return err(
        new SourceError(
          "Insurance policy source is unavailable",
          "SOURCE_NOT_FOUND",
        ),
      );
    }

    const parsed = SourceSchema.safeParse(
      matter(fs.readFileSync(filePath, "utf8")).data,
    );
    if (!parsed.success) {
      return err(
        new SourceError(
          "Insurance policy source is invalid",
          "SOURCE_VALIDATION_ERROR",
          parsed.error,
        ),
      );
    }
    const policy = parsed.data;
    const ltv =
      policy.scheduled_surrender_value > 0
        ? Math.round(
            (policy.policy_loan_total_deduction /
              policy.scheduled_surrender_value) *
              10_000,
          ) / 100
        : 0;

    return ok({
      name: "儲蓄險保單",
      policyType: policy.policy_type,
      valuationDate: asDate(policy.valuation_date),
      scheduledSurrenderValue: policy.scheduled_surrender_value,
      netSurrenderValue: policy.net_surrender_value,
      loanPrincipal: policy.policy_loan_principal,
      accruedInterest: policy.policy_loan_accrued_interest,
      estimatedDailyAdjustment: policy.policy_loan_estimated_daily_adjustment,
      totalLoanDeduction: policy.policy_loan_total_deduction,
      loanRate: policy.policy_loan_rate,
      surrenderGrowthRate: policy.policy_cash_value_growth_rate,
      ltv,
      nextInterestDue: asDate(policy.next_interest_due),
      interestCapitalizationRule: policy.interest_capitalization_rule,
      valuationStatus: policy.valuation_status,
    });
  } catch (cause) {
    return err(
      new SourceError(
        "Insurance policy source could not be read",
        "SOURCE_READ_ERROR",
        cause,
      ),
    );
  }
}
