import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { listOpenPositions } from "@/lib/data/portfolio-repository";
import { computeAllocation } from "@/lib/data/portfolio-calculations";

/**
 * GET /api/portfolio
 *
 * Returns all open portfolio positions with allocation breakdown
 * and summary statistics.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const positionsResult = listOpenPositions();

    if (!positionsResult.ok) {
      const safe = toSafeResponse(positionsResult.error);
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const positions = positionsResult.value;
    const allocation = computeAllocation(positions);

    // Summary stats
    const totalMarketValue = allocation.byStock.reduce(
      (sum, s) => sum + s.value,
      0,
    );
    const totalCost = positions.reduce(
      (sum, p) => sum + p.shares * p.avgCost,
      0,
    );
    const totalUnrealizedPnl = totalMarketValue - totalCost;

    return NextResponse.json(
      {
        version: 1,
        data: {
          positions,
          allocation: {
            byStock: allocation.byStock,
            bySector: allocation.bySector,
            byTheme: allocation.byTheme,
          },
          summary: {
            totalMarketValue,
            totalCost,
            totalUnrealizedPnl,
            unrealizedPnlPct:
              totalCost > 0
                ? Math.round((totalUnrealizedPnl / totalCost) * 10000) / 100
                : 0,
            positionCount: positions.length,
          },
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
