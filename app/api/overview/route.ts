import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toSafeResponse } from "@/lib/errors";
import {
  listOpenPositions,
  getDailySnapshots,
} from "@/lib/data/portfolio-repository";
import { listResearchSummariesForSymbols } from "@/lib/data/research-repository";
import { buildPortfolioResearchView } from "@/lib/data/portfolio-research-view";
import { loadPhaseOneInsightContext } from "@/lib/data/insight-context-repository";
import { loadStockTaxonomyLabels } from "@/lib/data/stock-taxonomy-repository";
import { monthlySummary } from "@/lib/data/finance-repository";
import { computeAllocationBreakdown } from "@/lib/analytics/allocation";
import {
  computeKpis,
  computeCashFlow,
  computePerformanceChart,
  generateInsights,
} from "@/lib/analytics";
import type { MonthlySummary } from "@/lib/schemas/finance";
import type { OverviewResponse } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

const RangeSchema = z.enum(["1M", "3M", "YTD", "1Y", "All"]);

const QuerySchema = z.object({
  range: RangeSchema.optional().default("1M"),
});

/**
 * GET /api/overview?range=1M
 *
 * Returns the complete overview dashboard payload: KPI cards,
 * allocation breakdown, performance chart, monthly cash flow,
 * and generated insights.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const now = new Date();
    const { searchParams } = request.nextUrl;

    const parsed = QuerySchema.safeParse({
      range: searchParams.get("range") ?? "1M",
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

    const phaseOneContext = loadPhaseOneInsightContext(now);

    // ------------------------------------------------------------------
    // Gather data from repositories (best-effort — partial data is OK)
    // ------------------------------------------------------------------

    const positionsResult = listOpenPositions();
    if (!positionsResult.ok) throw positionsResult.error;
    const positions = positionsResult.value;

    const researchResult = listResearchSummariesForSymbols(
      positions.map((position) => position.symbol),
    );
    if (!researchResult.ok) throw researchResult.error;
    const researchView = buildPortfolioResearchView(
      positions,
      researchResult.value,
    );

    const taxonomyResult = loadStockTaxonomyLabels();
    const taxonomyLabels = taxonomyResult.ok
      ? taxonomyResult.value
      : new Map<string, string>();

    // Allocation uses the same research-enriched taxonomy view as insights.
    const allocation = computeAllocationBreakdown(
      researchView.positions,
      taxonomyLabels,
    );

    // Total portfolio value
    const totalPortfolioValue = allocation.byStock.reduce(
      (sum, s) => sum + s.value,
      0,
    );

    // Monthly summary (current month)
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const summaryResult = monthlySummary(currentMonth);
    const currentMonthSummary: MonthlySummary | null = summaryResult.ok
      ? summaryResult.value
      : null;

    // Historical cash flow (last 6 months for chart)
    const cashFlowMap = new Map<string, MonthlySummary>();
    if (currentMonthSummary) {
      cashFlowMap.set(currentMonth, currentMonthSummary);
    }
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const r = monthlySummary(m);
      if (r.ok) cashFlowMap.set(m, r.value);
    }

    // Cash flow points
    const monthlyCashFlow = computeCashFlow(cashFlowMap);

    // Performance chart from snapshots
    const range = parsed.data.range;
    const since = rangeToSince(range, now);
    const snapshotsResult = getDailySnapshots(since);
    const snapshots = snapshotsResult.ok ? snapshotsResult.value : [];
    const performanceChart = computePerformanceChart(snapshots);

    // KPIs
    const kpiCards = computeKpis({
      monthlySummary: currentMonthSummary,
      positions,
      totalPortfolioValue,
    });

    // Insights use the same research-enriched view as /api/insights.
    const insights = generateInsights({
      ...phaseOneContext,
      positions: researchView.positions,
      researchSummaries: researchView.researchSummaries,
      invalidResearchSymbols: researchView.invalidResearchSymbols,
      now: now.toISOString(),
    });

    // ------------------------------------------------------------------
    // Build response
    // ------------------------------------------------------------------

    const data: OverviewResponse = {
      kpiCards,
      allocation,
      performanceChart,
      monthlyCashFlow,
      insights,
    };

    return NextResponse.json(
      { version: 1, data },
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

// ---------------------------------------------------------------------------
// Helper: map range → ISO date lower bound
// ---------------------------------------------------------------------------

function rangeToSince(range: z.infer<typeof RangeSchema>, now: Date): string {
  switch (range) {
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "3M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().slice(0, 10);
    }
    case "YTD": {
      return `${now.getFullYear()}-01-01`;
    }
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "All":
    default:
      return "2000-01-01";
  }
}
