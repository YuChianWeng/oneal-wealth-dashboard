"use server";

/**
 * Research repository — read-only access to stock research notes.
 *
 * Reads from whitelisted Trading/Stocks/ directory. Extracts specific
 * structured sections (thesis, catalysts, risks, invalidation, nextStep).
 * Missing sections return empty strings, not errors.
 */

import { assertServerOnly } from "@/lib/server-only";
import { SourceError, NotFoundError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import { readNote, listNotes } from "@/lib/data/vault-reader";
import {
  ResearchSummarySchema,
  type ResearchSummary,
} from "@/lib/schemas/research";

assertServerOnly();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STOCKS_DIR = "Trading/Stocks";

// Headings we scan for in the note body (case-insensitive)
const SECTION_HEADINGS: Record<string, RegExp[]> = {
  thesis: [/^##\s+thesis/i],
  catalysts: [/^##\s+catalyst/i],
  risks: [/^##\s+risk/i],
  invalidation: [/^##\s+invalidat/i],
  nextStep: [/^##\s+next\s*step/i, /^##\s+action/i],
};

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

/**
 * Extract content under a named heading from a Markdown body.
 * Returns the text under the heading up to the next heading of the same
 * or higher level, or end of file.
 */
function extractSection(content: string, headingPatterns: RegExp[]): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    // Check if this line matches one of our target headings
    const matched = headingPatterns.some((p) => p.test(line));
    if (matched) {
      inSection = true;
      continue; // skip the heading line itself
    }

    // If we're in a section and encounter another heading, stop
    if (inSection && /^##\s/.test(line)) {
      break;
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get research summary for a stock symbol.
 *
 * Reads the stock research note from Trading/Stocks/ and extracts
 * structured fields. Returns empty strings (not errors) when sections
 * are absent.
 */
export function getResearchSummary(
  symbol: string,
): Result<ResearchSummary, SourceError> {
  // List all stock notes and find matching file
  const files = listNotes(STOCKS_DIR);
  if (!files.ok) return files;

  const safeSymbol = symbol.trim().toUpperCase();
  const match = files.value.find((f) => {
    const base = f.split("/").pop() ?? "";
    return base.toUpperCase().startsWith(safeSymbol);
  });

  if (!match) {
    return err(
      new NotFoundError(
        `Research note not found for symbol: ${symbol}`,
        "VAULT_RESEARCH_NOT_FOUND",
      ),
    );
  }

  const noteResult = readNote(match);
  if (!noteResult.ok) return noteResult;

  const note = noteResult.value;
  const fm = note.frontmatter;

  // Extract structured sections from body
  const thesis = extractSection(note.content, SECTION_HEADINGS.thesis);
  const catalysts = extractSection(note.content, SECTION_HEADINGS.catalysts);
  const risks = extractSection(note.content, SECTION_HEADINGS.risks);
  const invalidation = extractSection(
    note.content,
    SECTION_HEADINGS.invalidation,
  );
  const nextStep = extractSection(note.content, SECTION_HEADINGS.nextStep);

  // Build the raw summary
  const rawSummary = {
    symbol: safeSymbol,
    name: String(fm.name ?? fm.Name ?? safeSymbol),
    status: String(fm.status ?? fm.Status ?? "watchlist"),
    sector: (fm.sector ?? fm.Sector ?? null) as string | null,
    theme: (fm.theme ?? fm.Theme ?? null) as string | null,
    conviction: (fm.conviction ?? fm.Conviction ?? null) as number | null,
    thesis: thesis || null,
    catalysts: catalysts || null,
    risks: risks || null,
    invalidation: invalidation || null,
    nextStep: nextStep || null,
    sourceChecked: (fm.sourceChecked ?? fm["source-checked"] ?? null) as
      | string
      | null,
    lastUpdated: (fm.lastUpdated ?? fm["last-updated"] ?? fm.date ?? null) as
      | string
      | null,
  };

  try {
    return ok(ResearchSummarySchema.parse(rawSummary));
  } catch (e) {
    return err(
      new SourceError(
        `Invalid research data for ${symbol}`,
        "VAULT_INVALID_RESEARCH",
        e,
      ),
    );
  }
}
