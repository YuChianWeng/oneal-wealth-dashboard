import "server-only";

import { readFileSync } from "node:fs";
import { assertServerOnly } from "@/lib/server-only";
import { SourceError } from "@/lib/errors";
import { ok, err, type Result } from "@/lib/result";
import {
  IntradayMarketHistorySchema,
  type IntradayMarketHistory,
} from "@/lib/schemas/market";

assertServerOnly();

const DEFAULT_HISTORY_DIR = "/home/ubuntu/data/market/history";
const DAY_START = 8 * 60 + 45;
const DAY_END = 13 * 60 + 45;
const NIGHT_START = 15 * 60;
const NIGHT_END = 5 * 60;

export type IntradaySession = "day" | "night";

function historyDir(): string {
  return process.env.MARKET_HISTORY_DIR || DEFAULT_HISTORY_DIR;
}

function taipeiMinutes(reference: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false,
  }).formatToParts(reference);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return Number(values.hour) * 60 + Number(values.minute);
}

export function taipeiDate(reference = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function marketSession(reference = new Date()): "day" | "night" | "closed" {
  const minutes = taipeiMinutes(reference);
  if (minutes >= DAY_START && minutes <= DAY_END) return "day";
  if (minutes >= NIGHT_START || minutes <= NIGHT_END) return "night";
  return "closed";
}

/** Select the producer history file shown by the chart right now. */
export function intradaySession(reference = new Date()): {
  date: string;
  session: IntradaySession;
} {
  const session = marketSession(reference) === "night" ? "night" : "day";
  const date = taipeiDate(reference);
  return {
    date: session === "night" && taipeiMinutes(reference) <= NIGHT_END
      ? shiftDate(date, -1)
      : date,
    session,
  };
}

function emptyHistory(
  date: string,
  session: IntradaySession,
): IntradayMarketHistory {
  return {
    version: 1,
    date,
    session,
    observedAt: new Date().toISOString(),
    taiex: [],
    txf: [],
  };
}

function historyPaths(date: string, session: IntradaySession): string[] {
  const current = `${historyDir()}/${date}-${session}.json`;
  // Read the original day-only filename during migration. New producer runs
  // write the explicit date-session filename and do not mix day/night points.
  return session === "day" ? [current, `${historyDir()}/${date}.json`] : [current];
}

/** Read today's active day/night history, fail-closed on corruption. */
export function loadIntradayMarketHistory(
  date?: string,
  session?: IntradaySession,
): Result<IntradayMarketHistory, SourceError> {
  const selected =
    date && session ? { date, session } : intradaySession();
  let raw: string | undefined;
  for (const path of historyPaths(selected.date, selected.session)) {
    try {
      raw = readFileSync(path, "utf-8");
      break;
    } catch {
      // The absence of a session file is expected before that session starts.
    }
  }

  if (raw === undefined) {
    return ok(emptyHistory(selected.date, selected.session));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      new SourceError(
        `${selected.session === "night" ? "今晚夜盤" : "今日早盤"}走勢資料格式錯誤`,
        "MARKET_HISTORY_INVALID_JSON",
        cause,
      ),
    );
  }

  const result = IntradayMarketHistorySchema.safeParse(parsed);
  if (!result.success) {
    return err(
      new SourceError(
        `${selected.session === "night" ? "今晚夜盤" : "今日早盤"}走勢資料未通過驗證`,
        "MARKET_HISTORY_SCHEMA_ERROR",
        result.error,
      ),
    );
  }

  if (result.data.date !== selected.date || result.data.session !== selected.session) {
    return err(
      new SourceError(
        "行情歷史資料的日期或盤別不一致",
        "MARKET_HISTORY_SESSION_MISMATCH",
      ),
    );
  }

  return ok(result.data);
}
