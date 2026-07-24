import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { listOpenPositions } from "@/lib/data/portfolio-repository";
import { listResearchSummariesForSymbols } from "@/lib/data/research-repository";
import { buildPortfolioResearchView } from "@/lib/data/portfolio-research-view";
import { loadStockTaxonomyLabels } from "@/lib/data/stock-taxonomy-repository";
import { computeAllocationBreakdown } from "@/lib/analytics/allocation";
import { loadMarketSnapshot } from "@/lib/data/market-snapshot-repository";
import { applyLiveMarketPrices } from "@/lib/data/live-market-pricing";
import type { AllocationBucket } from "@/lib/analytics/types";
import type { HoldingAllocation } from "@/lib/schemas/portfolio";

function asHoldingAllocation(bucket: AllocationBucket): HoldingAllocation {
  return {
    category: bucket.label,
    categoryId: bucket.id,
    value: bucket.value,
    percentage: bucket.percentage,
  };
}

/** GET /api/portfolio — research-enriched positions and taxonomy allocation. */
export async function GET(): Promise<NextResponse> {
  try {
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
    const marketResult = loadMarketSnapshot();
    const pricedPositions = marketResult.ok
      ? applyLiveMarketPrices(researchView.positions, marketResult.value)
      : researchView.positions;
    const pricedResearchView = { ...researchView, positions: pricedPositions };

    const taxonomyResult = loadStockTaxonomyLabels();
    const taxonomyLabels = taxonomyResult.ok
      ? taxonomyResult.value
      : new Map<string, string>();
    const breakdown = computeAllocationBreakdown(
      pricedResearchView.positions,
      taxonomyLabels,
    );
    const allocation = {
      byStock: breakdown.byStock.map(asHoldingAllocation),
      bySector: breakdown.bySector.map(asHoldingAllocation),
      byIndustry: breakdown.byIndustry.map(asHoldingAllocation),
      byTheme: breakdown.byTheme.map(asHoldingAllocation),
      byPortfolioRole: breakdown.byPortfolioRole.map(asHoldingAllocation),
    };

    const totalMarketValue = breakdown.byStock.reduce(
      (sum, bucket) => sum + bucket.value,
      0,
    );
    const totalCost = pricedResearchView.positions.reduce(
      (sum, position) => sum + position.shares * position.avgCost,
      0,
    );
    const totalUnrealizedPnl = totalMarketValue - totalCost;

    return NextResponse.json(
      {
        version: 1,
        data: {
          positions: pricedResearchView.positions,
          allocation,
          summary: {
            totalMarketValue,
            totalCost,
            totalUnrealizedPnl,
            unrealizedPnlPct:
              totalCost > 0
                ? Math.round((totalUnrealizedPnl / totalCost) * 10_000) / 100
                : 0,
            positionCount: researchView.positions.length,
          },
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    const safe = toSafeResponse(error);
    return NextResponse.json(
      { version: 1, error: safe },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
