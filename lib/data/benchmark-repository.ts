import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertServerOnly } from "@/lib/server-only";
import { config } from "@/lib/config";
import { SourceError } from "@/lib/errors";
import { latestCompletedTwseTradingDay } from "@/lib/market/twse-calendar";
import { err, ok, type Result } from "@/lib/result";
import {
  BenchmarkArtifactSchema,
  type BenchmarkArtifact,
  type BenchmarkSymbol,
} from "@/lib/schemas/benchmark";

assertServerOnly();

const BENCHMARK_DIR = "Trading/Portfolio/Benchmarks";

export interface BenchmarkSeries extends BenchmarkArtifact {
  latestDate: string;
  expectedLatestDate: string | null;
  freshness: "fresh" | "stale" | "unavailable";
  warnings: string[];
}

/**
 * Read one producer-owned benchmark artifact. This repository is deliberately
 * network-free and never mutates the producer's last-known-good JSON.
 */
export function benchmarkSeries(
  symbol: BenchmarkSymbol,
  now = new Date().toISOString(),
): Result<BenchmarkSeries, SourceError> {
  const path = join(config.obsidianVaultPath, BENCHMARK_DIR, `${symbol}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return err(
      new SourceError(
        `Benchmark series is unavailable for ${symbol}`,
        "BENCHMARK_SOURCE_UNAVAILABLE",
      ),
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return err(
      new SourceError(
        `Benchmark series is malformed for ${symbol}`,
        "BENCHMARK_JSON_INVALID",
      ),
    );
  }

  const parsed = BenchmarkArtifactSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.symbol !== symbol) {
    return err(
      new SourceError(
        `Benchmark series failed validation for ${symbol}`,
        "BENCHMARK_DATA_INVALID",
      ),
    );
  }

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    return err(
      new SourceError(
        "Benchmark freshness clock is invalid",
        "BENCHMARK_CLOCK_INVALID",
      ),
    );
  }
  const fetchedAtMs = Date.parse(parsed.data.fetchedAt);
  if (fetchedAtMs > nowMs + 5 * 60 * 1000) {
    return err(
      new SourceError(
        `Benchmark series has a future fetchedAt for ${symbol}`,
        "BENCHMARK_DATA_INVALID",
      ),
    );
  }

  const latestDate = parsed.data.points.at(-1)!.date;
  const fetchedDate = parsed.data.fetchedAt.slice(0, 10);
  if (latestDate > fetchedDate) {
    return err(
      new SourceError(
        `Benchmark series contains future points for ${symbol}`,
        "BENCHMARK_DATA_INVALID",
      ),
    );
  }

  const expectedLatestDate = latestCompletedTwseTradingDay(now);
  if (expectedLatestDate !== null && latestDate > expectedLatestDate) {
    return err(
      new SourceError(
        `Benchmark series is ahead of the completed TWSE session for ${symbol}`,
        "BENCHMARK_DATA_INVALID",
      ),
    );
  }

  const warnings: string[] = [];
  let freshness: BenchmarkSeries["freshness"];
  if (expectedLatestDate === null) {
    freshness = "unavailable";
    warnings.push(
      "Benchmark freshness unavailable outside verified TWSE calendar coverage",
    );
  } else if (latestDate < expectedLatestDate) {
    freshness = "stale";
    warnings.push(
      `Benchmark latest date ${latestDate} is older than expected TWSE session ${expectedLatestDate}`,
    );
  } else {
    freshness = "fresh";
  }

  return ok({
    ...parsed.data,
    latestDate,
    expectedLatestDate,
    freshness,
    warnings,
  });
}
