"use client";

import type { PerformanceChartData } from "@/lib/analytics";

export interface LineChartProps {
  /** Performance data from the API. */
  data: PerformanceChartData | null;
  /** Range label (e.g. "近 3 個月"). */
  rangeNote: string;
  /** Optional CSS class. */
  className?: string;
}

/** Chart dimensions. */
const W = 780;
const H = 290;
const PADL = 54;
const PADR = 14;
const PADT = 16;
const PADB = 40;

interface LineMeta {
  key: string;
  name: string;
  color: string;
  width: number;
  active: boolean;
  values: number[];
}

/**
 * SVG line chart for net-worth / portfolio growth.
 *
 * Renders portfolio + benchmark lines with grid, labels, and
 * end-of-line dots. Falls back to empty state when data is missing.
 */
export function LineChart({ data, rangeNote, className = "" }: LineChartProps) {
  if (!data || data.dates.length < 2 || data.portfolioIndex.length < 2) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center">
        <p className="text-[12px] text-dashboard-faint">尚無走勢資料</p>
      </div>
    );
  }

  const { dates, portfolioIndex, benchmarkIndex } = data;

  // Build line metas
  const lines: LineMeta[] = [
    {
      key: "portfolio",
      name: "投資組合",
      color: "var(--color-accent)",
      width: 2.6,
      active: true,
      values: portfolioIndex,
    },
  ];

  if (benchmarkIndex.length === portfolioIndex.length) {
    lines.push({
      key: "benchmark",
      name: "TAIEX",
      color: "var(--color-accent-2)",
      width: 2.1,
      active: true,
      values: benchmarkIndex,
    });
  }

  const n = dates.length;
  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;

  // Compute data range
  let lo = Infinity;
  let hi = -Infinity;
  for (const line of lines) {
    for (const v of line.values) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const pad = (hi - lo) * 0.12 || hi * 0.1;
  lo -= pad;
  hi += pad;

  const X = (i: number) => PADL + plotW * (i / (n - 1));
  const Y = (v: number) => PADT + plotH * (1 - (v - lo) / (hi - lo));

  // Build paths
  const paths = lines.map((line) => ({
    points: line.values
      .map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
      .join(" "),
    color: line.color,
    width: line.width,
  }));

  // Build dots at the last data point
  const dots = lines.map((line) => {
    const li = n - 1;
    const v = line.values[li];
    return {
      x: X(li).toFixed(1),
      y: Y(v).toFixed(1),
      color: line.color,
    };
  });

  // Area fill under portfolio line
  const areaPath = (() => {
    const pts = portfolioIndex.map(
      (v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`,
    );
    return `M ${pts.join(" L ")} L ${X(n - 1).toFixed(1)},${(PADT + plotH).toFixed(1)} L ${X(0).toFixed(1)},${(PADT + plotH).toFixed(1)} Z`;
  })();

  // Grid lines
  const gridYs: { y: number; label: string }[] = [];
  for (let i = 0; i <= 3; i++) {
    const v = lo + (hi - lo) * (i / 3);
    gridYs.push({
      y: Y(v),
      label: tickLabel(v),
    });
  }

  // X-axis labels (up to 6 evenly spaced)
  const xLabelCount = Math.min(6, n);
  const xLabels: { x: number; label: string }[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    const idx = Math.round((i / (xLabelCount - 1)) * (n - 1));
    xLabels.push({ x: X(idx), label: dates[idx] });
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-auto w-full"
      >
        {/* Grid */}
        {gridYs.map((g, i) => (
          <g key={i}>
            <line
              x1={PADL}
              y1={g.y.toFixed(1)}
              x2={W - PADR}
              y2={g.y.toFixed(1)}
              stroke="var(--color-border)"
              strokeWidth="1"
            />
            <text
              x={PADL - 8}
              y={(g.y + 3.5).toFixed(1)}
              textAnchor="end"
              fill="var(--color-faint)"
              fontSize="10.5"
              fontFamily="'IBM Plex Mono', monospace"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((x, i) => (
          <text
            key={i}
            x={x.x.toFixed(1)}
            y={H - PADB + 16}
            textAnchor="middle"
            fill="var(--color-faint)"
            fontSize="10.5"
            fontFamily="'IBM Plex Mono', monospace"
          >
            {x.label}
          </text>
        ))}

        {/* Area fill */}
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              stopColor="var(--color-accent)"
              stopOpacity="0.20"
            />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaFill)" stroke="none" />

        {/* Lines */}
        {paths.map((p, i) => (
          <polyline
            key={i}
            fill="none"
            stroke={p.color}
            strokeWidth={p.width}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={p.points}
          />
        ))}

        {/* End dots */}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="3.4"
            fill="var(--color-surface)"
            stroke={d.color}
            strokeWidth="2"
          />
        ))}
      </svg>

      {/* Range note */}
      <div className="mt-[6px] text-[12px] text-dashboard-faint">
        {rangeNote}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tickLabel(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return `${Math.round(v / 1_000)}K`;
}
