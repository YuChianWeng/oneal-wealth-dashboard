"use client";

import { formatTWD } from "@/lib/format";

export interface PerformanceChartPoint {
  date: string;
  label: string;
  portfolio: number | null;
  primaryBenchmark: number | null;
  secondaryBenchmark: number | null;
  primaryObservationDate: string | null;
  secondaryObservationDate: string | null;
  marketValue: number;
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
  payload?: PerformanceChartPoint;
}

export function PerformanceChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="rounded-ds-md border border-dashboard-border bg-dashboard-surface px-3 py-2 shadow-ds-card">
      <p className="mb-1 text-[11px] text-dashboard-faint">
        組合日期 {point?.date ?? label}
      </p>
      {payload.map((entry) => {
        const observationDate =
          entry.name === "primaryBenchmark"
            ? entry.payload?.primaryObservationDate
            : entry.name === "secondaryBenchmark"
              ? entry.payload?.secondaryObservationDate
              : null;
        return (
          <div key={entry.name}>
            <p
              className="text-[12px] font-medium"
              style={{ color: entry.color }}
            >
              {entry.name === "marketValue"
                ? `市值 ${formatTWD(entry.value)}`
                : entry.name === "primaryBenchmark"
                  ? `0050 指數 ${entry.value.toFixed(1)}`
                  : entry.name === "secondaryBenchmark"
                    ? `TAIEX 指數 ${entry.value.toFixed(1)}`
                    : `組合指數 ${entry.value.toFixed(1)}`}
            </p>
            {observationDate && observationDate !== entry.payload?.date ? (
              <p className="text-[10px] text-dashboard-faint">
                實際觀測日 {observationDate}（沿用至組合日期）
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
