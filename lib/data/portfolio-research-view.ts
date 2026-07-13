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

    const researchThemes =
      research.themes && research.themes.length > 0
        ? research.themes
        : research.theme
          ? [research.theme]
          : undefined;
    const themes =
      researchThemes ??
      (position.themes && position.themes.length > 0
        ? position.themes
        : position.theme
          ? [position.theme]
          : []);

    return {
      ...position,
      classificationVersion:
        research.classificationVersion ??
        position.classificationVersion ??
        null,
      classificationStatus:
        research.classificationStatus ?? position.classificationStatus ?? null,
      assetClass: research.assetClass ?? position.assetClass ?? null,
      market: research.market ?? position.market ?? null,
      sector: research.sector ?? position.sector ?? null,
      industry: research.industry ?? position.industry ?? null,
      subindustry: research.subindustry ?? position.subindustry ?? null,
      portfolioRole: research.portfolioRole ?? position.portfolioRole ?? null,
      themes,
      theme: themes[0] ?? position.theme ?? null,
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
