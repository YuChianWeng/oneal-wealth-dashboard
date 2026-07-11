"use client";

import type { AllocationBucket } from "@/lib/analytics";

export interface DonutChartProps {
  /** Allocation buckets to visualise (first 4 are used). */
  buckets: AllocationBucket[];
  /** Total value label (e.g. "NT$4,554,000"). */
  totalLabel: string;
  /** Optional CSS class. */
  className?: string;
}

/** Predefined palette matching the dashboard design. */
const PALETTE = [
  "var(--color-accent)",
  "var(--color-accent-2)",
  "var(--color-warn)",
  "var(--color-faint)",
];

/**
 * SVG donut chart for asset allocation.
 *
 * Renders a donut with up to 4 segments plus a legend.
 * Falls back to an empty state when there are no buckets.
 */
export function DonutChart({
  buckets,
  totalLabel,
  className = "",
}: DonutChartProps) {
  if (!buckets || buckets.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <p className="text-[12px] text-dashboard-faint">尚無配置資料</p>
      </div>
    );
  }

  const top4 = buckets.slice(0, 4);
  const otherPct = 100 - top4.reduce((sum, b) => sum + b.percentage, 0);
  const displayBuckets =
    otherPct > 0.5
      ? [
          ...top4,
          {
            label: "其他",
            value: 0,
            percentage: Math.round(otherPct * 10) / 10,
          },
        ]
      : top4;

  const R = 64;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * R;

  let cumulativeOffset = 0;

  const segments = displayBuckets.map((bucket, i) => {
    const pct = bucket.percentage / 100;
    const dashLength = circumference * pct;
    const offset = -cumulativeOffset;
    cumulativeOffset += dashLength;
    return {
      color: PALETTE[i % PALETTE.length],
      dash: dashLength,
      offset,
      label: bucket.label,
      pct: bucket.percentage.toFixed(1),
    };
  });

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-[6px]">
        {/* Donut SVG */}
        <svg
          viewBox="0 0 200 200"
          className="h-[150px] w-[150px] flex-shrink-0"
          style={{ transform: "rotate(-90deg)" }}
        >
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={strokeWidth}
          />
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.dash.toFixed(2)} ${(circumference - seg.dash).toFixed(2)}`}
              strokeDashoffset={seg.offset.toFixed(2)}
            />
          ))}
          {/* Center text */}
          <text
            x="100"
            y="100"
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-text)"
            fontSize="13"
            fontWeight="600"
            fontFamily="'IBM Plex Mono', monospace"
            style={{
              transform: "rotate(90deg)",
              transformOrigin: "100px 100px",
            }}
          >
            {totalLabel}
          </text>
        </svg>

        {/* Legend */}
        <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-[9px]">
              <span
                className="h-[9px] w-[9px] flex-shrink-0 rounded-[3px]"
                style={{ background: seg.color }}
              />
              <span className="min-w-0 flex-1 text-[12.5px]">{seg.label}</span>
              <span className="font-mono text-[12.5px] text-dashboard-muted">
                {seg.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
