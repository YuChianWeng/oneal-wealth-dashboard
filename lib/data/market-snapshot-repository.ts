import "server-only";

import { readFileSync } from "node:fs";
import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import {
  MarketSnapshotSchema,
  type MarketSnapshot,
} from "@/lib/schemas/market";

assertServerOnly();

const DEFAULT_MARKET_SNAPSHOT_PATH =
  "/home/ubuntu/data/market/wealth-market-snapshot.json";

function marketSnapshotPath(): string {
  return process.env.MARKET_SNAPSHOT_PATH || DEFAULT_MARKET_SNAPSHOT_PATH;
}

/**
 * Read the host-produced latest market snapshot.
 *
 * The web app remains read-only: the producer owns network access, credentials,
 * scheduling, and atomic snapshot replacement. This repository only reads and
 * validates the resulting JSON document.
 */
export function loadMarketSnapshot(): Result<MarketSnapshot, SourceError> {
  let raw: string;
  try {
    raw = readFileSync(marketSnapshotPath(), "utf-8");
  } catch (cause) {
    return err(
      new SourceError(
        "即時行情快照尚未就緒",
        "MARKET_SNAPSHOT_UNAVAILABLE",
        cause,
      ),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      new SourceError(
        "即時行情快照格式錯誤",
        "MARKET_SNAPSHOT_INVALID_JSON",
        cause,
      ),
    );
  }

  const result = MarketSnapshotSchema.safeParse(parsed);
  if (!result.success) {
    return err(
      new SourceError(
        "即時行情快照未通過資料驗證",
        "MARKET_SNAPSHOT_SCHEMA_ERROR",
        result.error,
      ),
    );
  }

  return ok(result.data);
}
