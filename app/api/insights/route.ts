import "server-only";

/**
 * GET /api/insights — deterministic insight generation.
 *
 * Loads readonly position and research data, builds an enriched portfolio view,
 * then runs pure analytics rules. Never sends raw vault content to the client.
 */

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { listOpenPositions } from "@/lib/data/portfolio-repository";
import { listResearchSummariesForSymbols } from "@/lib/data/research-repository";
import { buildPortfolioResearchView } from "@/lib/data/portfolio-research-view";
import { generateInsights } from "@/lib/analytics/insights";

const CACHE_HEADERS = { "Cache-Control": "private, no-store" } as const;

export async function GET() {
  try {
    const positionsResult = listOpenPositions();
    if (!positionsResult.ok) throw positionsResult.error;

    const symbols = positionsResult.value.map((position) => position.symbol);
    const researchResult = listResearchSummariesForSymbols(symbols);
    if (!researchResult.ok) throw researchResult.error;

    const view = buildPortfolioResearchView(
      positionsResult.value,
      researchResult.value,
    );
    const insights = generateInsights({
      positions: view.positions,
      researchSummaries: view.researchSummaries,
      invalidResearchSymbols: view.invalidResearchSymbols,
    });

    return NextResponse.json(
      { version: 1, data: insights },
      { status: 200, headers: CACHE_HEADERS },
    );
  } catch (error) {
    const safe = toSafeResponse(error);
    return NextResponse.json(
      { version: 1, error: safe },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
}
