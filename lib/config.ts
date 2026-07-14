import "server-only";

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

assertServerOnly();

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

function isInside(candidate: string, parent: string): boolean {
  const normCandidate = candidate.replace(/\/+$/, "");
  const normParent = parent.replace(/\/+$/, "");
  return (
    normCandidate === normParent || normCandidate.startsWith(normParent + "/")
  );
}

const FINANCE_DB_PATH = requiredEnv("FINANCE_DB_PATH");
const OBSIDIAN_VAULT_PATH = requiredEnv("OBSIDIAN_VAULT_PATH");
const APP_TIMEZONE = optionalEnv("APP_TIMEZONE", "Asia/Taipei");
const APP_ORIGIN = optionalEnv("APP_ORIGIN", "http://localhost:3003");
const PORT = parseInt(optionalEnv("PORT", "3003"), 10);
const INSIGHT_CASH_STALE_DAYS_RAW = optionalEnv("INSIGHT_CASH_STALE_DAYS", "7");

const VAULT_ROOT = "/home/ubuntu/ObsidianVault";
const DATA_ROOT = "/home/ubuntu/data/finance";

const warnings: string[] = [];

const parsedInsightCashStaleDays = Number(INSIGHT_CASH_STALE_DAYS_RAW);
const hasValidInsightCashStaleDays =
  /^[1-9]\d*$/.test(INSIGHT_CASH_STALE_DAYS_RAW) &&
  Number.isSafeInteger(parsedInsightCashStaleDays);
const INSIGHT_CASH_STALE_DAYS = hasValidInsightCashStaleDays
  ? parsedInsightCashStaleDays
  : 7;
if (!hasValidInsightCashStaleDays) {
  const msg =
    "INSIGHT_CASH_STALE_DAYS must be a positive integer — using default value 7";
  console.warn(`[Config] ${msg}`);
  warnings.push(msg);
}

if (!isInside(FINANCE_DB_PATH, DATA_ROOT)) {
  const msg = `FINANCE_DB_PATH "${FINANCE_DB_PATH}" is outside the allowed data root (${DATA_ROOT}) — proceeding anyway`;
  console.warn(`[Config] ${msg}`);
  warnings.push(msg);
}

if (!isInside(OBSIDIAN_VAULT_PATH, VAULT_ROOT)) {
  const msg = `OBSIDIAN_VAULT_PATH "${OBSIDIAN_VAULT_PATH}" is outside the allowed vault root (${VAULT_ROOT}) — proceeding anyway`;
  console.warn(`[Config] ${msg}`);
  warnings.push(msg);
}

if (!existsSync(FINANCE_DB_PATH)) {
  const msg = `FINANCE_DB_PATH "${FINANCE_DB_PATH}" does not exist — finance features will be unavailable`;
  console.warn(`[Config] ${msg}`);
  warnings.push(msg);
}

if (!existsSync(OBSIDIAN_VAULT_PATH)) {
  const msg = `OBSIDIAN_VAULT_PATH "${OBSIDIAN_VAULT_PATH}" does not exist — vault features will be unavailable`;
  console.warn(`[Config] ${msg}`);
  warnings.push(msg);
}

export interface ServerConfig {
  readonly financeDbPath: string;
  readonly obsidianVaultPath: string;
  readonly timezone: string;
  readonly origin: string;
  readonly port: number;
  readonly insightCashStaleDays: number;
  readonly vaultRoot: string;
  readonly dataRoot: string;
  readonly warnings: readonly string[];
}

export const config: ServerConfig = Object.freeze({
  financeDbPath: FINANCE_DB_PATH,
  obsidianVaultPath: OBSIDIAN_VAULT_PATH,
  timezone: APP_TIMEZONE,
  origin: APP_ORIGIN,
  port: PORT,
  insightCashStaleDays: INSIGHT_CASH_STALE_DAYS,
  vaultRoot: VAULT_ROOT,
  dataRoot: DATA_ROOT,
  warnings: Object.freeze(warnings),
});
