/**
 * Portfolio allocation analysis over research-enriched positions.
 */

import type { PositionSummary } from "@/lib/schemas/portfolio";
import type { AllocationBucket, AllocationResult } from "./types";

const UNCLASSIFIED = "unclassified";
type TaxonomyLabels = ReadonlyMap<string, string>;

function positionValue(position: PositionSummary): number {
  return position.marketValue ?? position.shares * position.avgCost;
}

function totalValue(positions: PositionSummary[]): number {
  return positions.reduce((sum, position) => sum + positionValue(position), 0);
}

function roundPercentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10_000) / 100 : 0;
}

function bucketsFromMap(
  values: Map<string, number>,
  total: number,
  labels: TaxonomyLabels = new Map(),
): AllocationBucket[] {
  return [...values.entries()]
    .map(([id, value]) => ({
      id,
      label: id === UNCLASSIFIED ? UNCLASSIFIED : (labels.get(id) ?? id),
      value,
      percentage: roundPercentage(value, total),
    }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

function computeSingleDimension(
  positions: PositionSummary[],
  selector: (position: PositionSummary) => string | null | undefined,
  labels?: TaxonomyLabels,
): AllocationBucket[] {
  if (positions.length === 0) return [];
  const values = new Map<string, number>();
  for (const position of positions) {
    const id = selector(position)?.trim() || UNCLASSIFIED;
    values.set(id, (values.get(id) ?? 0) + positionValue(position));
  }
  return bucketsFromMap(values, totalValue(positions), labels);
}

export function computeAllocationByStock(
  positions: PositionSummary[],
): AllocationBucket[] {
  const total = totalValue(positions);
  return positions
    .map((position) => {
      const value = positionValue(position);
      return {
        id: position.symbol,
        label: `${position.symbol} — ${position.name}`,
        value,
        percentage: roundPercentage(value, total),
      };
    })
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

export function computeAllocationBySector(
  positions: PositionSummary[],
  labels?: TaxonomyLabels,
): AllocationBucket[] {
  return computeSingleDimension(
    positions,
    (position) => position.sector,
    labels,
  );
}

export function computeAllocationByIndustry(
  positions: PositionSummary[],
  labels?: TaxonomyLabels,
): AllocationBucket[] {
  return computeSingleDimension(
    positions,
    (position) => position.industry,
    labels,
  );
}

export function computeAllocationByPortfolioRole(
  positions: PositionSummary[],
  labels?: TaxonomyLabels,
): AllocationBucket[] {
  return computeSingleDimension(
    positions,
    (position) => position.portfolioRole,
    labels,
  );
}

/**
 * Compute theme exposure. A position contributes its full value to every
 * canonical theme, so percentages intentionally may sum above 100%.
 */
export function computeAllocationByTheme(
  positions: PositionSummary[],
  labels?: TaxonomyLabels,
): AllocationBucket[] {
  if (positions.length === 0) return [];
  const values = new Map<string, number>();
  for (const position of positions) {
    const canonical = (position.themes ?? [])
      .map((theme) => theme.trim())
      .filter(Boolean);
    const themes = [
      ...new Set(
        canonical.length > 0
          ? canonical
          : position.theme?.trim()
            ? [position.theme.trim()]
            : [],
      ),
    ];
    const ids = themes.length > 0 ? themes : [UNCLASSIFIED];
    for (const id of ids) {
      values.set(id, (values.get(id) ?? 0) + positionValue(position));
    }
  }
  return bucketsFromMap(values, totalValue(positions), labels);
}

export function computeAllocationBreakdown(
  positions: PositionSummary[],
  labels?: TaxonomyLabels,
): AllocationResult {
  return {
    byStock: computeAllocationByStock(positions),
    bySector: computeAllocationBySector(positions, labels),
    byIndustry: computeAllocationByIndustry(positions, labels),
    byTheme: computeAllocationByTheme(positions, labels),
    byPortfolioRole: computeAllocationByPortfolioRole(positions, labels),
  };
}
