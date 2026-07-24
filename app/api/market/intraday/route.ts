import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { loadIntradayMarketHistory } from "@/lib/data/market-history-repository";

/** GET /api/market/intraday — today's day-session line-chart read model. */
export async function GET(): Promise<NextResponse> {
  try {
    const result = loadIntradayMarketHistory();
    if (!result.ok) {
      return NextResponse.json(
        { version: 1, error: toSafeResponse(result.error) },
        {
          status: 500,
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
  } catch (error) {
    return NextResponse.json(
      { version: 1, error: toSafeResponse(error) },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
