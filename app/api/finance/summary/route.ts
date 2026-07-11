import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toSafeResponse } from "@/lib/errors";
import { monthlySummary } from "@/lib/data/finance-repository";

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

const QuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM format"),
  includeInvestment: z
    .enum(["true", "false"])
    .optional()
    .default("false"),
});

/**
 * GET /api/finance/summary?month=YYYY-MM&includeInvestment=false
 *
 * Returns monthly finance summary: operating totals, category/account breakdown.
 * Investment-bucket accounts are excluded by default.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    // Validate query params
    const parsed = QuerySchema.safeParse({
      month: searchParams.get("month"),
      includeInvestment: searchParams.get("includeInvestment") ?? "false",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          version: 1,
          error: {
            message: "Invalid query parameters",
            code: "VALIDATION_ERROR",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const { month } = parsed.data;

    const result = monthlySummary(month);

    if (!result.ok) {
      const safe = toSafeResponse(result.error);
      const status = result.error.code === "SOURCE_NOT_FOUND" ? 404 : 500;
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    return NextResponse.json(
      { version: 1, data: result.value },
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
