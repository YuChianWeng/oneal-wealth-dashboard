/**
 * Taiwan Stock Exchange session calendar helpers.
 *
 * Holiday dates are checked in from the official TWSE 115-year market
 * schedule: https://www.twse.com.tw/holidaySchedule/holidaySchedule
 *
 * Coverage is intentionally explicit. Outside 2026, weekends are still
 * handled but callers should refresh this set when TWSE publishes a new
 * annual schedule. Price files are expected to be refreshed after 14:00
 * Asia/Taipei on trading days (the exchange closes at 13:30).
 */

const PRICE_UPDATE_HOUR = 14;
const VERIFIED_CALENDAR_YEARS = new Set(["2026"]);

const TWSE_HOLIDAYS_2026 = new Set([
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
]);

function shiftDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function taipeiDateTime(now: string): { date: string; hour: number } {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid current timestamp");
  }
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
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

export function isTwseTradingDay(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const weekday = parsed.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !TWSE_HOLIDAYS_2026.has(date);
}

export function hasVerifiedTwseCalendar(date: string): boolean {
  return VERIFIED_CALENDAR_YEARS.has(date.slice(0, 4));
}

/**
 * Return the latest trading session whose refreshed close should be available.
 * Returns null rather than guessing when the annual holiday calendar is absent.
 */
export function latestCompletedTwseTradingDay(now: string): string | null {
  const local = taipeiDateTime(now);
  if (!hasVerifiedTwseCalendar(local.date)) return null;
  let candidate = local.date;

  if (isTwseTradingDay(candidate) && local.hour < PRICE_UPDATE_HOUR) {
    candidate = shiftDate(candidate, -1);
  }
  while (!isTwseTradingDay(candidate)) {
    candidate = shiftDate(candidate, -1);
  }
  return candidate;
}
