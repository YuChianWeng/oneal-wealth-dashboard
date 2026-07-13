import "server-only";

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
import {
  readNote,
  listNotes,
  type RawNote,
} from "@/lib/data/vault-reader";
import {
  ResearchSummarySchema,
  type ResearchSummary,
} from "@/lib/schemas/research";

assertServerOnly();

const STOCKS_DIR = "Trading/Stocks";

const SECTION_HEADINGS: Record<string, RegExp[]> = {
  thesis: [/^##\s+.*\bthesis\b/i, /^##\s+.*(一句話結論|投資論點|核心觀點)/i],
  catalysts: [/^##\s+.*\bcatalyst/i, /^##\s+.*(催化劑|利多|why this stock)/i],
  risks: [/^##\s+.*\brisk/i, /^##\s+.*風險/i],
  invalidation: [
    /^##\s+.*\binvalidat/i,
    /^##\s+.*(失效條件|反方觀點|no buy if)/i,
  ],
  nextStep: [
    /^##\s+.*\bnext\s*step/i,
    /^##\s+.*\baction/i,
    /^##\s+.*(下一步|追蹤事項|行動項目)/i,
  ],
};

export interface InvalidResearchNote {
  symbol: string;
  code: string;
}

export interface ResearchIndexResult {
  summaries: Map<string, ResearchSummary>;
  invalid: InvalidResearchNote[];
}

function extractSection(content: string, headingPatterns: RegExp[]): string {
  const lines = content.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const matched = headingPatterns.some((p) => p.test(line));
    if (matched) {
      inSection = true;
      continue;
    }

    if (inSection && /^##\s/.test(line)) break;
    if (inSection) sectionLines.push(line);
  }

  return sectionLines.join("\n").trim();
}

function isoDateOrNull(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

/** Normalize Taiwan aliases to the vault-facing XXXX.TW identity. */
export function normalizeResearchSymbol(value: string): string {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{4,6})(?:\.(?:TW|TWO))?$/);
  return match ? `${match[1]}.TW` : normalized;
}

function symbolFromPath(path: string): string {
  const base = path.split("/").pop()?.replace(/\.md$/i, "") ?? "";
  const token = base.split(/[\s.](?=[A-Za-z])/)[0] || base.split(/\s+/)[0] || "";
  const codeMatch = base.match(/^(\d{4,6})(?:\.(?:TW|TWO))?/i);
  return normalizeResearchSymbol(codeMatch?.[0] ?? token);
}

function noteSymbols(note: RawNote): Set<string> {
  const fm = note.frontmatter;
  const values = [
    symbolFromPath(note.path),
    fm.quote_symbol,
    fm.quoteSymbol,
    fm.symbol,
    fm.ticker,
  ];
  const symbols = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const symbol = normalizeResearchSymbol(String(value));
    if (symbol) symbols.add(symbol);
  }
  return symbols;
}

function nameFromPath(path: string, symbol: string): string {
  const base = path.split("/").pop()?.replace(/\.md$/i, "").trim() ?? "";
  const prefixes = [symbol, symbol.split(".")[0]];
  for (const prefix of prefixes) {
    if (base.toUpperCase().startsWith(prefix.toUpperCase())) {
      const rest = base.slice(prefix.length).replace(/^\.stock-note/i, "").trim();
      if (rest) return rest;
    }
  }
  return symbol;
}

function parseResearchSummary(
  note: RawNote,
  symbol: string,
): Result<ResearchSummary, SourceError> {
  const fm = note.frontmatter;
  const thesis = extractSection(note.content, SECTION_HEADINGS.thesis);
  const catalysts = extractSection(note.content, SECTION_HEADINGS.catalysts);
  const risks = extractSection(note.content, SECTION_HEADINGS.risks);
  const invalidation = extractSection(
    note.content,
    SECTION_HEADINGS.invalidation,
  );
  const nextStep = extractSection(note.content, SECTION_HEADINGS.nextStep);

  const rawSummary = {
    symbol,
    name: String(
      fm.name ?? fm.Name ?? nameFromPath(note.path, symbol) ?? symbol,
    ),
    status: String(fm.status ?? fm.Status ?? "watchlist"),
    sector: (fm.sector ?? fm.Sector ?? null) as string | null,
    theme: (fm.theme ?? fm.Theme ?? null) as string | null,
    conviction: Number.isFinite(Number(fm.conviction ?? fm.Conviction))
      ? Number(fm.conviction ?? fm.Conviction)
      : null,
    thesis: thesis || String(fm.thesis ?? fm.one_line_thesis ?? "") || null,
    catalysts: catalysts || null,
    risks: risks || String(fm.no_buy_if ?? "") || null,
    invalidation: invalidation || String(fm.no_buy_if ?? "") || null,
    nextStep: nextStep || String(fm.next_step ?? "") || null,
    sourceChecked: isoDateOrNull(
      fm.sourceChecked ??
        fm["source-checked"] ??
        fm.source_checked ??
        fm.last_review,
    ),
    lastUpdated: isoDateOrNull(
      fm.lastUpdated ??
        fm["last-updated"] ??
        fm.last_updated ??
        fm.last_review ??
        fm.date,
    ),
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

/**
 * Read Trading/Stocks once and return valid summaries plus matching invalid notes.
 * Symbols without any matching note are intentionally absent from both outputs.
 */
export function listResearchSummariesForSymbols(
  symbols: string[],
): Result<ResearchIndexResult, SourceError> {
  const requested = [...new Set(symbols.map(normalizeResearchSymbol))];
  const requestedSet = new Set(requested);
  const files = listNotes(STOCKS_DIR);
  if (!files.ok) return files;

  const candidatesBySymbol = new Map<string, RawNote[]>();
  const candidateCountBySymbol = new Map<string, number>();
  const invalidBySymbol = new Map<string, InvalidResearchNote>();

  const registerCandidate = (symbol: string) => {
    candidateCountBySymbol.set(
      symbol,
      (candidateCountBySymbol.get(symbol) ?? 0) + 1,
    );
  };

  for (const file of files.value) {
    const pathSymbol = symbolFromPath(file);
    const noteResult = readNote(file);
    if (!noteResult.ok) {
      if (requestedSet.has(pathSymbol)) {
        registerCandidate(pathSymbol);
        invalidBySymbol.set(pathSymbol, {
          symbol: pathSymbol,
          code: noteResult.error.code,
        });
      }
      continue;
    }

    const identitySymbols = new Set(
      [...noteSymbols(noteResult.value)].filter((symbol) =>
        /^\d{4,6}\.TW$/.test(symbol),
      ),
    );
    const matchedSymbols = requested.filter((symbol) =>
      identitySymbols.has(symbol),
    );
    if (matchedSymbols.length === 0) continue;

    for (const symbol of matchedSymbols) registerCandidate(symbol);

    if (identitySymbols.size > 1) {
      for (const symbol of matchedSymbols) {
        invalidBySymbol.set(symbol, {
          symbol,
          code: "VAULT_RESEARCH_IDENTITY_CONFLICT",
        });
      }
      continue;
    }

    const noteType = String(noteResult.value.frontmatter.type ?? "")
      .trim()
      .toLowerCase();
    if (noteType !== "stock-note") {
      for (const symbol of matchedSymbols) {
        invalidBySymbol.set(symbol, {
          symbol,
          code: "VAULT_RESEARCH_WRONG_TYPE",
        });
      }
      continue;
    }

    for (const symbol of matchedSymbols) {
      const candidates = candidatesBySymbol.get(symbol) ?? [];
      candidates.push(noteResult.value);
      candidatesBySymbol.set(symbol, candidates);
    }
  }

  const summaries = new Map<string, ResearchSummary>();
  const invalid: InvalidResearchNote[] = [];
  for (const symbol of requested) {
    if ((candidateCountBySymbol.get(symbol) ?? 0) > 1) {
      invalid.push({ symbol, code: "VAULT_DUPLICATE_RESEARCH" });
      continue;
    }

    const knownInvalid = invalidBySymbol.get(symbol);
    if (knownInvalid) {
      invalid.push(knownInvalid);
      continue;
    }

    const candidate = candidatesBySymbol.get(symbol)?.[0];
    if (!candidate) continue;

    const parsed = parseResearchSummary(candidate, symbol);
    if (parsed.ok) {
      summaries.set(symbol, parsed.value);
    } else {
      invalid.push({ symbol, code: parsed.error.code });
    }
  }

  return ok({ summaries, invalid });
}

export function getResearchSummary(
  symbol: string,
): Result<ResearchSummary, SourceError> {
  const safeSymbol = normalizeResearchSymbol(symbol);
  const index = listResearchSummariesForSymbols([safeSymbol]);
  if (!index.ok) return index;

  const summary = index.value.summaries.get(safeSymbol);
  if (summary) return ok(summary);

  const invalid = index.value.invalid.find((item) => item.symbol === safeSymbol);
  if (invalid) {
    return err(
      new SourceError(
        `Invalid research data for ${safeSymbol}`,
        invalid.code,
      ),
    );
  }

  return err(
    new NotFoundError(
      `Research note not found for symbol: ${symbol}`,
      "VAULT_RESEARCH_NOT_FOUND",
    ),
  );
}
