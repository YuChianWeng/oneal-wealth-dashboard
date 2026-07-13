/**
 * Taiwan Stock Exchange session calendar helpers.
 *
 * Holiday dates are checked in from the official TWSE 115-year market
 * schedule: https://www.twse.com.tw/holidaySchedule/holidaySchedule
 *
 * Coverage is intentionally explicit. Price files are expected to be
 * refreshed after 14:00 Asia/Taipei on trading days (the exchange closes at
 * 13:30). Callers receive null rather than a guessed session outside verified
 * annual coverage.
 */

const PRICE_UPDATE_HOUR = 14;

const TWSE_HOLIDAYS_BY_YEAR: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [
    [
      "2026",
      new Set([
        "2026-01-01",
        "2026-02-12",
        "2026-02-13",
        "2026-02-16",
        "2026-02-17",
        "2026-02-18",
        "2026-02-19",
        "2026-02-20",
        "2026-02-27",
        "2026-04-03",
        "2026-04-06",
        "2026-05-01",
        "2026-06-19",
        "2026-09-25",
        "2026-09-28",
        "2026-10-09",
        "2026-10-26",
        "2026-12-25",
      ]),
    ],
  ],
);

function isISODate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function taipeiDateTime(now: string): { date: string; hour: number } | null {
  // Offsetless timestamps are environment-dependent and therefore rejected.
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(now)) return null;
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  return isISODate(date) && Number.isInteger(hour) ? { date, hour } : null;
}

export function taipeiDateISO(now: string): string | null {
  return taipeiDateTime(now)?.date ?? null;
}

export function hasVerifiedTwseCalendar(date: string): boolean {
  return isISODate(date) && TWSE_HOLIDAYS_BY_YEAR.has(date.slice(0, 4));
}

export function isTwseTradingDay(date: string): boolean {
  const holidays = TWSE_HOLIDAYS_BY_YEAR.get(date.slice(0, 4));
  if (!holidays || !isISODate(date)) return false;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(date);
}

/**
 * Return the latest trading session whose refreshed close should be available.
 * Returns null for invalid timestamps and whenever traversal leaves verified
 * annual holiday coverage.
 */
export function latestCompletedTwseTradingDay(now: string): string | null {
  const local = taipeiDateTime(now);
  if (!local || !hasVerifiedTwseCalendar(local.date)) return null;
  let candidate = local.date;

  if (isTwseTradingDay(candidate) && local.hour < PRICE_UPDATE_HOUR) {
    candidate = shiftDate(candidate, -1);
  }

  while (hasVerifiedTwseCalendar(candidate)) {
    if (isTwseTradingDay(candidate)) return candidate;
    candidate = shiftDate(candidate, -1);
  }
  return null;
}
