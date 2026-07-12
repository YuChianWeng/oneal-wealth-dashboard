"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTWD } from "@/lib/format";

export interface NetWorthChartPoint {
  date: string;
  netWorth: number;
}

export interface NetWorthLineChartProps {
  points: NetWorthChartPoint[];
  rangeNote: string;
}

export function formatNetWorthAxis(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 10_000)
    return `${sign}${(abs / 10_000).toFixed(abs >= 1_000_000 ? 0 : 1)}萬`;
  return `${sign}${Math.round(abs).toLocaleString()}`;
}

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : date;
}

function NetWorthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-ds-md border border-dashboard-border bg-dashboard-surface px-3 py-2 shadow-ds-card">
      <p className="text-[11px] text-dashboard-faint">{label}</p>
      <p className="mt-1 font-mono text-[12px] text-dashboard-text">
        淨資產 {formatTWD(payload[0].value)}
      </p>
    </div>
  );
}

export function NetWorthLineChart({
  points,
  rangeNote,
}: NetWorthLineChartProps) {
  if (points.length < 2) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[12px] text-dashboard-faint">
          尚無足夠的淨資產走勢資料
        </p>
      </div>
    );
  }

  const data = points.map((point) => ({
    ...point,
    label: shortDate(point.date),
  }));

  return (
    <div className="flex flex-col">
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="overviewNetWorthFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.24}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-accent)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--color-faint)" }}
              tickFormatter={formatNetWorthAxis}
              width={58}
            />
            <Tooltip content={<NetWorthTooltip />} />
            <Area
              type="monotone"
              dataKey="netWorth"
              name="netWorth"
              stroke="var(--color-accent)"
              strokeWidth={2.4}
              fill="url(#overviewNetWorthFill)"
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-[6px] text-[12px] text-dashboard-faint">
        {rangeNote}
      </div>
    </div>
  );
}
