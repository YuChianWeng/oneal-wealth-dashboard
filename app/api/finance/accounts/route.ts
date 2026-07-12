import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { accountsList, loansSummary } from "@/lib/data/finance-repository";
import { savingsPolicySummary } from "@/lib/data/insurance-policy-repository";

/**
 * GET /api/finance/accounts
 *
 * Returns the list of active accounts with their latest balances
 * and current loan summaries.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const accountsResult = accountsList();
    const loansResult = loansSummary();
    const policyResult = savingsPolicySummary();

    if (!accountsResult.ok) {
      const safe = toSafeResponse(accountsResult.error);
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    if (!loansResult.ok) {
      const safe = toSafeResponse(loansResult.error);
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    if (!policyResult.ok) {
      const safe = toSafeResponse(policyResult.error);
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return NextResponse.json(
      {
        version: 1,
        data: {
          accounts: accountsResult.value,
          loans: loansResult.value,
          insurancePolicy: policyResult.value,
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    const safe = toSafeResponse(err);
    return NextResponse.json(
      { version: 1, error: safe },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
