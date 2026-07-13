import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { ResearchSummary } from "@/lib/schemas/research";
import type { ResearchIndexResult } from "@/lib/data/research-repository";

export interface PortfolioResearchView {
  positions: PositionSummary[];
  researchSummaries: ResearchSummary[];
  invalidResearchSymbols: string[];
}

function canonicalSymbol(value: string): string {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{4,6})(?:\.(?:TW|TWO))?$/);
  return match ? `${match[1]}.TW` : normalized;
}

/**
 * Merge canonical research metadata into position view models.
 *
 * Position values remain a legacy fallback during migration. The source notes
 * are never modified; this is a readonly view-model transformation.
 */
export function buildPortfolioResearchView(
  positions: PositionSummary[],
  researchIndex: ResearchIndexResult,
): PortfolioResearchView {
  const researchBySymbol = new Map<string, ResearchSummary>();
  for (const [symbol, summary] of researchIndex.summaries) {
    researchBySymbol.set(canonicalSymbol(symbol), summary);
  }

  const enrichedPositions = positions.map((position) => {
    const research = researchBySymbol.get(canonicalSymbol(position.symbol));
    if (!research) return { ...position };

    return {
      ...position,
      sector: research.sector ?? position.sector ?? null,
      theme: research.theme ?? position.theme ?? null,
      conviction: research.conviction ?? position.conviction ?? null,
    };
  });

  const researchSummaries = positions.flatMap((position) => {
    const research = researchBySymbol.get(canonicalSymbol(position.symbol));
    return research ? [research] : [];
  });

  return {
    positions: enrichedPositions,
    researchSummaries,
    invalidResearchSymbols: researchIndex.invalid.map((item) =>
      canonicalSymbol(item.symbol),
    ),
  };
}
