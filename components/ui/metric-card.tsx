import type { HTMLAttributes } from "react";

export type MetricTrend = "up" | "down" | "neutral";

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Label shown above the value (e.g. "總淨資產"). */
  label: string;
  /** Sub-label / hint displayed alongside the label. */
  hint?: string;
  /** Primary numeric value, already formatted (e.g. "NT$4,286,000"). */
  value: string;
  /** Directional trend indicator. */
  trend?: MetricTrend;
  /** Trend percentage label, already formatted (e.g. "+2.3%" or "▼ 4.1%"). */
  trendLabel?: string;
  /** Delta amount label, already formatted (e.g. "+NT$96,400 vs 上月"). */
  deltaLabel?: string;
  /** Optional description or extra content below the delta. */
  description?: string;
}

const TREND_STYLES: Record<MetricTrend, string> = {
  up: "text-dashboard-pos",
  down: "text-dashboard-neg",
  neutral: "text-dashboard-muted",
};

const TREND_ARROW: Record<MetricTrend, string> = {
  up: "▲",
  down: "▼",
  neutral: "—",
};

/**
 * KPI / metric card.
 *
 * Displays a label, large formatted value, trend indicator with
 * up/down arrows (accessibility: non-colour-only indicators),
 * delta amount, and optional description.
 */
export function MetricCard({
  label,
  hint,
  value,
  trend,
  trendLabel,
  deltaLabel,
  description,
  className = "",
  ...rest
}: MetricCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[18px_19px] shadow-ds-card ${className}`}
      {...rest}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] tracking-[0.2px] text-dashboard-muted">
          {label}
        </span>
        {hint ? (
          <span className="font-mono-dashboard text-[10.5px] text-dashboard-faint">
            {hint}
          </span>
        ) : null}
      </div>

      {/* Value */}
      <div className="mt-[11px] whitespace-nowrap font-mono-dashboard text-[clamp(22px,2.15vw,30px)] font-semibold -tracking-[0.6px]">
        {value}
      </div>

      {/* Trend + delta row */}
      {(trend || trendLabel || deltaLabel) && (
        <div className="mt-[9px] flex items-center gap-[7px] text-[12.5px]">
          {trend && trendLabel ? (
            <span className={`font-semibold ${TREND_STYLES[trend]}`}>
              <span aria-hidden="true">{TREND_ARROW[trend]} </span>
              {trendLabel}
            </span>
          ) : trendLabel ? (
            <span className="font-semibold text-dashboard-muted">
              {trendLabel}
            </span>
          ) : null}
          {deltaLabel ? (
            <span className="font-mono-dashboard text-dashboard-faint">
              {deltaLabel}
            </span>
          ) : null}
        </div>
      )}

      {/* Description */}
      {description ? (
        <div className="mt-[6px] text-[11.5px] text-dashboard-faint">
          {description}
        </div>
      ) : null}
    </div>
  );
}
