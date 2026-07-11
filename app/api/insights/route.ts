import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { listOpenPositions } from "@/lib/data/portfolio-repository";
import { monthlySummary } from "@/lib/data/finance-repository";
import { computeAllocationBreakdown } from "@/lib/analytics/allocation";
import { generateInsights } from "@/lib/analytics/insights";
import { computeKpis } from "@/lib/analytics/kpis";
import { computeCashFlow } from "@/lib/analytics/cashflow";
import { computePerformanceChart } from "@/lib/analytics/performance";
import { getDailySnapshots } from "@/lib/data/portfolio-repository";
import type { OverviewResponse, PerformanceChartData } from "@/lib/analytics";

/**
 * GET /api/insights
 *
 * Returns generated dashboard insights with severity levels and
 * drill-through URLs. Each insight points to the relevant page
 * for further action.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const positionsResult = listOpenPositions();
    const positions = positionsResult.ok ? positionsResult.value : [];

    // Current month summary
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const summaryResult = monthlySummary(currentMonth);
    const currentMonthSummary = summaryResult.ok ? summaryResult.value : null;

    const insights = generateInsights({
      positions,
      now: now.toISOString(),
    });

    return NextResponse.json(
      { version: 1, data: insights },
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
