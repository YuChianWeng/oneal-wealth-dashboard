import "server-only";

import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight health check. Returns process readiness with timestamp.
 * No data access — just confirms the route handler is alive.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      version: 1,
      data: {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
