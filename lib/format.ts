/**
 * Formatting utilities for the Oneal Wealth Dashboard.
 *
 * All functions are defensive: they never throw and return sensible
 * fallback strings for null / undefined / NaN / Infinity.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unicode minus sign, more typographic than a hyphen-minus. */
const MINUS = "−";

/**
 * Returns true when `v` is a finite number (not NaN, not ±Infinity, not null / undefined).
 */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Safe formatter: calls `fmt` only when `v` is a finite number, otherwise returns `fallback`.
 */
function safeFmt<T>(v: unknown, fmt: (n: number) => T, fallback: T): T {
  return isFiniteNumber(v) ? fmt(v) : fallback;
}

/** Taiwan locale with grouping separators. */
const TWD_LOCALE: Intl.NumberFormatOptions = {
  style: "decimal",
  useGrouping: true,
  maximumFractionDigits: 0,
};

/** Asia/Taipei timezone formatter (cached). */
const DATE_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();

function getDateFmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let fmt = DATE_FMT_CACHE.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      ...opts,
    });
    DATE_FMT_CACHE.set(key, fmt);
  }
  return fmt;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a TWD amount with NT$ prefix, comma separators, and no decimals.
 *
 * @example
 *   formatTWD(4286000)   // "NT$4,286,000"
 *   formatTWD(-1500)     // "−NT$1,500"
 *   formatTWD(NaN)       // "NT$—"
 */
export function formatTWD(amount: unknown): string {
  return safeFmt(
    amount,
    (n) => {
      const abs = Math.round(Math.abs(n));
      const sign = n < 0 ? MINUS : "";
      const formatted = new Intl.NumberFormat("en-US", TWD_LOCALE).format(abs);
      return `${sign}NT$${formatted}`;
    },
    "NT$—",
  );
}

/**
 * Format a percentage value to one decimal place.
 *
 * @param value   The percentage (2.3 → "+2.3%")
 * @param signed  When true, always prefix with "+" for positive values.
 *                Default false.
 *
 * @example
 *   formatPercent(2.3, true)   // "+2.3%"
 *   formatPercent(-4.1, true)  // "−4.1%"
 *   formatPercent(18.4)        // "18.4%"
 */
export function formatPercent(value: unknown, signed?: boolean): string {
  return safeFmt(
    value,
    (n) => {
      const rounded = Math.round(n * 10) / 10;
      const abs = Math.abs(rounded);
      let prefix = "";
      if (signed && rounded > 0) prefix = "+";
      else if (rounded < 0) prefix = MINUS;
      return `${prefix}${abs.toFixed(1)}%`;
    },
    "—%",
  );
}

/**
 * Format a date in Asia/Taipei timezone.
 *
 * @param date   Date object or ISO string.
 * @param format "numeric" → 2026/7/11, "short" → 7月11日.
 *               Defaults to "numeric".
 *
 * @example
 *   formatDate(new Date("2026-07-11"), "numeric")  // "2026/7/11"
 */
export function formatDate(
  date: Date | string,
  format: "numeric" | "short" = "numeric",
): string {
  if (date === null || date === undefined) return "—";

  let d: Date;
  if (typeof date === "string") {
    d = new Date(date);
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) return "—";

  if (format === "short") {
    return getDateFmt({ month: "short", day: "numeric" }).format(d);
  }

  return getDateFmt({
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(d);
}

/**
 * Return a human-readable relative freshness label in Chinese.
 *
 * @param date  Date object or ISO string.
 *
 * @example
 *   formatRelativeFreshness(new Date())  // "剛剛"
 *   formatRelativeFreshness(twoHoursAgo) // "2 小時前"
 *   formatRelativeFreshness(threeDaysAgo)// "3 天前"
 */
export function formatRelativeFreshness(
  date: Date | string,
  referenceDate?: Date | number,
): string {
  if (date === null || date === undefined) return "—";

  let d: Date;
  if (typeof date === "string") {
    d = new Date(date);
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) return "—";

  const now =
    referenceDate instanceof Date
      ? referenceDate.getTime()
      : typeof referenceDate === "number"
        ? referenceDate
        : Date.now();
  const diffMs = now - d.getTime();

  // Future dates: fall back to a plain date string.
  if (diffMs < 0) {
    return formatDate(d);
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (hours < 24) return `${hours} 小時前`;
  if (days < 30) return `${days} 天前`;

  // Older than 30 days → show a short date.
  return formatDate(d, "short");
}

/**
 * Format a TWD amount in compact notation (K / M suffixes).
 *
 * @example
 *   formatCompact(352000)   // "NT$352K"
 *   formatCompact(4286000)  // "NT$4.29M"
 *   formatCompact(-500)     // "−NT$500"
 */
export function formatCompact(n: unknown): string {
  return safeFmt(
    n,
    (v) => {
      const abs = Math.abs(v);
      const sign = v < 0 ? MINUS : "";

      if (abs < 1_000) {
        return `${sign}NT$${Math.round(abs)}`;
      }

      if (abs < 1_000_000) {
        const k = abs / 1_000;
        // Use integer K when >= 100K, one decimal otherwise
        const formatted =
          abs >= 100_000 ? Math.round(k).toString() : k.toFixed(1);
        return `${sign}NT$${formatted}K`;
      }

      const m = abs / 1_000_000;
      const formatted = abs >= 10_000_000 ? m.toFixed(1) : m.toFixed(2);
      return `${sign}NT$${formatted}M`;
    },
    "NT$—",
  );
}
