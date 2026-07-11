import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { availableMonths } from "@/lib/data/finance-repository";

/**
 * GET /api/finance/reviews
 *
 * Returns the list of available YYYY-MM months that have transaction data,
 * ordered newest first. These represent months that can be reviewed.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = availableMonths(12);

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

    return NextResponse.json(
      {
        version: 1,
        data: {
          months: result.value,
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
