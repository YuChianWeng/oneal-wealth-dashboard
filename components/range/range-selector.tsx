"use client";

export type RangeKey = "1M" | "3M" | "YTD" | "1Y" | "All";

export interface RangeSelectorProps {
  /** Currently selected range. */
  value: RangeKey;
  /** Called when the user picks a different range. */
  onChange: (range: RangeKey) => void;
  /** Optional additional class name. */
  className?: string;
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "YTD", label: "YTD" },
  { key: "1Y", label: "1Y" },
  { key: "All", label: "All" },
];

/**
 * Date range pill selector matching the dashboard design.
 *
 * Displays 5 pill buttons (1M / 3M / YTD / 1Y / All).
 * Active button has surface-2 background, bold mono text;
 * inactive buttons use faint colour.
 */
export function RangeSelector({
  value,
  onChange,
  className = "",
}: RangeSelectorProps) {
  return (
    <div
      className={`inline-flex items-center gap-[2px] rounded-[10px] border border-dashboard-border bg-dashboard-surface p-[3px] ${className}`}
      role="radiogroup"
      aria-label="時間範圍"
    >
      {RANGES.map((r) => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(r.key)}
            className={`rounded-[8px] border-none px-[12px] py-[5px] font-mono text-[12px] leading-none transition-colors cursor-pointer ${
              active
                ? "bg-dashboard-surface-2 text-dashboard-text font-semibold"
                : "bg-transparent text-dashboard-faint font-normal hover:text-dashboard-text"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
