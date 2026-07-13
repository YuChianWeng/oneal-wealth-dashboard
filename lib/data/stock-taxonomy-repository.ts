import "server-only";

import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { err, ok, type Result } from "@/lib/result";
import { readNote } from "@/lib/data/vault-reader";

assertServerOnly();

const TAXONOMY_NOTE = "Trading/Stock Classification Taxonomy.md";
const TAXONOMY_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

function addLabel(
  labels: Map<string, string>,
  id: unknown,
  label: unknown,
): void {
  if (
    typeof id === "string" &&
    TAXONOMY_ID.test(id) &&
    typeof label === "string" &&
    label.trim()
  ) {
    labels.set(id, label.trim());
  }
}

/** Parse canonical `{ id, label }[]` registries from YAML frontmatter. */
export function parseStockTaxonomyFrontmatter(
  frontmatter: Record<string, unknown>,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const value of Object.values(frontmatter)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      addLabel(labels, record.id, record.label);
    }
  }
  return labels;
}

/** Parse legacy Markdown `ID | Label` tables into one stable label lookup. */
export function parseStockTaxonomyLabels(content: string): Map<string, string> {
  const labels = new Map<string, string>();
  for (const line of content.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const [id, label] = cells;
    if (id === "ID" || /^-+$/.test(id)) continue;
    addLabel(labels, id, label);
  }
  return labels;
}

export function loadStockTaxonomyLabels(): Result<
  Map<string, string>,
  SourceError
> {
  const note = readNote(TAXONOMY_NOTE);
  if (!note.ok) return note;

  const labels = parseStockTaxonomyFrontmatter(note.value.frontmatter);
  for (const [id, label] of parseStockTaxonomyLabels(note.value.content)) {
    if (!labels.has(id)) labels.set(id, label);
  }
  if (labels.size === 0) {
    return err(
      new SourceError(
        "Stock taxonomy contains no display labels",
        "VAULT_INVALID_TAXONOMY",
      ),
    );
  }
  return ok(labels);
}
