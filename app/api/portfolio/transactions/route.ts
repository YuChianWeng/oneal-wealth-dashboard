import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { listAllTrades } from "@/lib/data/portfolio-repository";

/**
 * GET /api/portfolio/transactions
 *
 * Returns all trade transactions sorted by date (newest first).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const result = listAllTrades();

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
          trades: result.value,
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
