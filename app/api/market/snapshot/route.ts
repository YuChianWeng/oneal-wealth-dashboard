import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { loadMarketSnapshot } from "@/lib/data/market-snapshot-repository";

/** GET /api/market/snapshot — latest one-minute market read model. */
export async function GET(): Promise<NextResponse> {
  try {
    const result = loadMarketSnapshot();
    if (!result.ok) {
      return NextResponse.json(
        { version: 1, error: toSafeResponse(result.error) },
        {
          status: 503,
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
