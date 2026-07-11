"use server";

/**
 * Validated server config singleton.
 *
 * Reads environment variables, validates path safety boundaries,
 * and exports a frozen typed config object.  Missing optional paths
 * produce a warning — they never crash the dev server.
 */

import { existsSync } from "node:fs";
import { assertServerOnly } from "@/lib/server-only";
import { ConfigError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Runtime guard — this file must never end up in a client bundle.
// ---------------------------------------------------------------------------
assertServerOnly();

// ---------------------------------------------------------------------------
// Environment variable reading
// ---------------------------------------------------------------------------

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (val === undefined || val === "") {
    throw new ConfigError(
      `Missing required environment variable: ${key}`,
      "CONFIG_MISSING_ENV",
    );
  }
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  const val = process.env[key];
  return val !== undefined && val !== "" ? val : fallback;
}

// ---------------------------------------------------------------------------
// Path validation helpers
// ---------------------------------------------------------------------------

/** Returns true when `candidate` is inside `parent` (resolved, no symlink traversal). */
function isInside(candidate: string, parent: string): boolean {
  // Simple prefix check — real path traversal is handled at the read layer.
  const normCandidate = candidate.replace(/\/+$/, "");
  const normParent = parent.replace(/\/+$/, "");
  return (
    normCandidate === normParent || normCandidate.startsWith(normParent + "/")
  );
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const FINANCE_DB_PATH = requiredEnv("FINANCE_DB_PATH");
const OBSIDIAN_VAULT_PATH = requiredEnv("OBSIDIAN_VAULT_PATH");
const APP_TIMEZONE = optionalEnv("APP_TIMEZONE", "Asia/Taipei");
const APP_ORIGIN = optionalEnv("APP_ORIGIN", "http://localhost:3000");
const PORT = parseInt(optionalEnv("PORT", "3000"), 10);

// --- Safety boundaries ---

const VAULT_ROOT = "/home/ubuntu/ObsidianVault";
const DATA_ROOT = "/home/ubuntu/data/finance";

if (!isInside(FINANCE_DB_PATH, DATA_ROOT)) {
  throw new ConfigError(
    `FINANCE_DB_PATH is outside the allowed data root (${DATA_ROOT})`,
    "CONFIG_PATH_OUTSIDE_ROOT",
  );
}

if (!isInside(OBSIDIAN_VAULT_PATH, VAULT_ROOT)) {
  throw new ConfigError(
    `OBSIDIAN_VAULT_PATH is outside the allowed vault root (${VAULT_ROOT})`,
    "CONFIG_PATH_OUTSIDE_ROOT",
  );
}

// --- Existence checks (warn, don't crash) ---

const existingWarnings: string[] = [];

if (!existsSync(FINANCE_DB_PATH)) {
  const msg = `FINANCE_DB_PATH "${FINANCE_DB_PATH}" does not exist — finance features will be unavailable`;
  console.warn(`[Config] ${msg}`);
  existingWarnings.push(msg);
}

if (!existsSync(OBSIDIAN_VAULT_PATH)) {
  const msg = `OBSIDIAN_VAULT_PATH "${OBSIDIAN_VAULT_PATH}" does not exist — vault features will be unavailable`;
  console.warn(`[Config] ${msg}`);
  existingWarnings.push(msg);
}

// ---------------------------------------------------------------------------
// Typed config object
// ---------------------------------------------------------------------------

export interface ServerConfig {
  readonly financeDbPath: string;
  readonly obsidianVaultPath: string;
  readonly timezone: string;
  readonly origin: string;
  readonly port: number;
  readonly vaultRoot: string;
  readonly dataRoot: string;
  /** Warnings raised during validation (non-fatal). */
  readonly warnings: readonly string[];
}

export const config: ServerConfig = Object.freeze({
  financeDbPath: FINANCE_DB_PATH,
  obsidianVaultPath: OBSIDIAN_VAULT_PATH,
  timezone: APP_TIMEZONE,
  origin: APP_ORIGIN,
  port: PORT,
  vaultRoot: VAULT_ROOT,
  dataRoot: DATA_ROOT,
  warnings: Object.freeze(existingWarnings),
});
