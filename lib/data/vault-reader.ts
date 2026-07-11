import "server-only";

/**
 * Safe read-only Obsidian vault file reader.
 *
 * Only reads from whitelisted subdirectories under the vault root.
 * Resolves symlinks, rejects path-traversal, and never exposes raw
 * file paths or full note bodies in errors.
 */

import { readFileSync, readdirSync, realpathSync, existsSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import matter from "gray-matter";
import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import { config } from "@/lib/config";

assertServerOnly();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A successfully parsed vault note. */
export interface RawNote {
  /** Vault-relative path (safe — never an absolute path). */
  path: string;
  /** Parsed YAML frontmatter as a plain object. */
  frontmatter: Record<string, unknown>;
  /** Markdown body after the frontmatter. */
  content: string;
}

// ---------------------------------------------------------------------------
// Whitelisted root directories (vault-relative)
// ---------------------------------------------------------------------------

const WHITELISTED_ROOTS: readonly string[] = [
  "Trading/Portfolio/Positions",
  "Trading/Portfolio/Transactions",
  "Trading/Portfolio/Snapshots",
  "Trading/Stocks",
] as const;

// ---------------------------------------------------------------------------
// Path resolution utilities
// ---------------------------------------------------------------------------

/** Cache of resolved whitelist roots (absolute, symlink-resolved). */
let _resolvedRoots: string[] | null = null;

function resolvedRoots(): string[] {
  if (_resolvedRoots) return _resolvedRoots;
  const vault = config.obsidianVaultPath;
  _resolvedRoots = WHITELISTED_ROOTS.map((rel) => {
    const abs = resolve(join(vault, rel));
    if (existsSync(abs)) {
      return realpathSync(abs);
    }
    return abs;
  });
  return _resolvedRoots;
}

/**
 * Validate that `relativePath` stays inside a whitelisted root.
 * Returns the **resolved absolute path** on success, or a SourceError.
 */
function resolveSafePath(relativePath: string): Result<string, SourceError> {
  // Reject paths that contain un-normalized segments
  if (relativePath.includes("..")) {
    return err(
      new SourceError("Path traversal detected", "VAULT_PATH_TRAVERSAL"),
    );
  }

  // Normalize and resolve to absolute
  const normalized = normalize(relativePath).replace(/^\/+/, "");
  const vault = config.obsidianVaultPath;
  const absolute = resolve(join(vault, normalized));

  // Symlink resolution (if file/dir exists)
  let resolved: string;
  try {
    resolved = existsSync(absolute) ? realpathSync(absolute) : absolute;
  } catch {
    return err(
      new SourceError("Unable to resolve vault path", "VAULT_PATH_RESOLVE"),
    );
  }

  // Check against whitelisted roots
  const roots = resolvedRoots();
  const inside = roots.some(
    (root) => resolved === root || resolved.startsWith(root + "/"),
  );

  if (!inside) {
    return err(
      new SourceError(
        "Access denied: path is outside whitelisted directories",
        "VAULT_PATH_OUTSIDE_WHITELIST",
      ),
    );
  }

  return ok(resolved);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse a single vault note by vault-relative path.
 *
 * Returns `RawNote` with parsed YAML frontmatter and markdown body.
 * Paths must resolve within whitelisted subdirectories.
 */
export function readNote(relativePath: string): Result<RawNote, SourceError> {
  const resolved = resolveSafePath(relativePath);
  if (!resolved.ok) return resolved;

  const absPath = resolved.value;

  // Only .md files
  if (!absPath.endsWith(".md")) {
    return err(
      new SourceError(
        "Only Markdown files can be read from the vault",
        "VAULT_NOT_MARKDOWN",
      ),
    );
  }

  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch (e) {
    return err(
      new SourceError("Unable to read vault note", "VAULT_READ_ERROR", e),
    );
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (e) {
    return err(
      new SourceError(
        "Unable to parse vault note frontmatter",
        "VAULT_PARSE_ERROR",
        e,
      ),
    );
  }

  // Sanitize frontmatter: ensure it's a plain object
  const fm: Record<string, unknown> =
    typeof parsed.data === "object" && parsed.data !== null
      ? { ...(parsed.data as Record<string, unknown>) }
      : {};

  const safePath = normalize(relativePath).replace(/^\/+/, "");

  return ok({
    path: safePath,
    frontmatter: fm,
    content: parsed.content,
  });
}

/**
 * List all Markdown files in a whitelisted subdirectory.
 *
 * Returns vault-relative paths to `.md` files only.
 */
export function listNotes(relativeDir: string): Result<string[], SourceError> {
  const resolved = resolveSafePath(relativeDir);
  if (!resolved.ok) return resolved;

  const absDir = resolved.value;

  let entries: Array<{ isFile: () => boolean; name: string }>;
  try {
    entries = readdirSync(absDir, { withFileTypes: true }) as unknown as Array<{
      isFile: () => boolean;
      name: string;
    }>;
  } catch (e) {
    return err(
      new SourceError("Unable to list vault directory", "VAULT_LIST_ERROR", e),
    );
  }

  const files = entries
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => {
      const rel = normalize(join(relativeDir, d.name));
      return rel.replace(/^\/+/, "");
    });

  return ok(files);
}
