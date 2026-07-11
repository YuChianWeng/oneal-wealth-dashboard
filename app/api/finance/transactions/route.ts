import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toSafeResponse } from "@/lib/errors";
import { transactionsPage } from "@/lib/data/finance-repository";

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

const QuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM format"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  account: z.string().optional(),
});

/**
 * GET /api/finance/transactions?month=YYYY-MM&page=1&pageSize=20&category=&account=
 *
 * Returns paginated transactions for a given month with optional
 * category and account filters. Investment-bucket accounts are excluded.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    const parsed = QuerySchema.safeParse({
      month: searchParams.get("month"),
      page: searchParams.get("page") ?? "1",
      pageSize: searchParams.get("pageSize") ?? "20",
      category: searchParams.get("category") ?? undefined,
      account: searchParams.get("account") ?? undefined,
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

    const { month, page, pageSize, category, account } = parsed.data;

    const result = transactionsPage(month, page, pageSize);

    if (!result.ok) {
      const safe = toSafeResponse(result.error);
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    // Apply optional client-side filters
    let { rows, total } = result.value;

    if (category) {
      rows = rows.filter(
        (r) => r.category.toLowerCase() === category.toLowerCase(),
      );
      total = rows.length;
    }

    if (account) {
      rows = rows.filter(
        (r) => r.account.toLowerCase() === account.toLowerCase(),
      );
      total = rows.length;
    }

    return NextResponse.json(
      {
        version: 1,
        data: { rows, total, page, pageSize },
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
