"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { useApi } from "@/lib/hooks/use-api";
import type {
  IntradayMarketHistory,
  IntradayPoint,
} from "@/lib/schemas/market";

export interface IntradayChartRow {
  timestamp: string;
  label: string;
  taiex: number | null;
  txf: number | null;
}

function formatTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatIntradayAxis(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type MinuteBucket = {
  taiex?: IntradayPoint;
  txf?: IntradayPoint;
};

function minuteBucket(timestamp: string): number | null {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) return null;
  return Math.floor(milliseconds / 60_000) * 60_000;
}

function addPoints(
  buckets: Map<number, MinuteBucket>,
  points: IntradayPoint[],
  key: "taiex" | "txf",
) {
  for (const point of points) {
    const bucket = minuteBucket(point.timestamp);
    if (bucket === null) continue;
    const existing = buckets.get(bucket) ?? {};
    const previous = existing[key];
    // Providers can emit more than one observation in a minute. Keep the
    // latest observation while aligning TAIEX/TXF timestamps to one x-axis.
    if (!previous || point.timestamp > previous.timestamp) {
      existing[key] = point;
    }
    buckets.set(bucket, existing);
  }
}

/** Align provider timestamps to Taipei minutes without inventing data. */
export function toIntradayChartData(
  history: IntradayMarketHistory,
): IntradayChartRow[] {
  const buckets = new Map<number, MinuteBucket>();
  addPoints(buckets, history.taiex, "taiex");
  addPoints(buckets, history.txf, "txf");
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucket, values]) => {
      const timestamp = new Date(bucket).toISOString();
      return {
        timestamp,
        label: formatTime(timestamp),
        taiex: values.taiex?.value ?? null,
        txf: values.txf?.value ?? null,
      };
    });
}

function IntradayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    value?: number | null;
    color?: string;
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((item) => item.value != null);
  if (!visible.length) return null;
  return (
    <div className="rounded-ds-md border border-dashboard-border bg-dashboard-surface px-3 py-2 shadow-ds-card">
      <p className="text-[11px] text-dashboard-faint">{label}</p>
      {visible.map((item) => (
        <p
          key={item.dataKey}
          className="mt-1 font-mono text-[12px] text-dashboard-text"
        >
          <span style={{ color: item.color }}>
            {item.dataKey === "taiex" ? "TAIEX" : "TXF"}
          </span>{" "}
          {formatPrice(item.value)}
        </p>
      ))}
    </div>
  );
}

function chartTitle(session: IntradayMarketHistory["session"] | undefined): string {
  return session === "night" ? "今晚夜盤走勢" : "今日早盤走勢";
}

function chartDescription(
  session: IntradayMarketHistory["session"] | undefined,
): string {
  if (session === "night") {
    return "15:00–05:00 TXF 夜盤 · 每分鐘累積 · TAIEX 為 TWSE 最近收盤快照，不建立夜盤指數線";
  }
  return "09:00–13:30 TAIEX · 08:45–13:45 TXF · 每分鐘累積 · 日盤折線圖";
}

function chartSourceDescription(
  session: IntradayMarketHistory["session"] | undefined,
): string {
  return session === "night"
    ? "圖表來源：TXF · TAIFEX MIS；指數來源：TAIEX · TWSE MIS（收盤）"
    : "圖表來源：TAIEX · TWSE MIS、TXF · TAIFEX MIS";
}

/** Session-aware TAIEX/TXF line chart; night session shows the live TXF line. */
export function IntradayLineChart() {
  const { data, error, isLoading, isValidating } =
    useApi<IntradayMarketHistory>("/api/market/intraday", {
      refreshInterval: 60_000,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
      refreshWhenHidden: true,
    });

  const chartData = data ? toIntradayChartData(data) : [];
  const activePoints = chartData.filter((row) =>
    data?.session === "night"
      ? row.txf !== null
      : row.taiex !== null || row.txf !== null,
  );
  const hasEnoughPoints = activePoints.length >= 2;
  const hasTaiex = chartData.some((row) => row.taiex !== null);
  const hasTxf = chartData.some((row) => row.txf !== null);
  const updatedLabel = data
    ? `資料至 ${formatTime(data.observedAt)}${isValidating ? " · 更新中" : ""}`
    : isLoading
      ? "走勢資料載入中…"
      : "等待走勢資料";

  return (
    <Card
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold">{chartTitle(data?.session)}</h2>
            <p className="mt-1 text-[11px] text-dashboard-faint">
              {chartDescription(data?.session)}
            </p>
            <p className="mt-1 text-[10px] text-dashboard-faint">
              {chartSourceDescription(data?.session)}
            </p>
          </div>
          <span className="font-mono text-[10.5px] text-dashboard-faint">
            {updatedLabel}
          </span>
        </div>
      }
    >
      {error && !data ? (
        <div className="flex min-h-[240px] items-center justify-center text-[12px] text-dashboard-warn">
          {error.message}
        </div>
      ) : !hasEnoughPoints ? (
        <div className="flex min-h-[240px] items-center justify-center text-center text-[12px] text-dashboard-faint">
          <p>
            尚無足夠的{data?.session === "night" ? "夜盤" : "日盤"}走勢資料
            <br />
            {data?.session === "night"
              ? "夜盤開始後會每分鐘累積 TXF 線圖"
              : "日盤開始後會每分鐘累積 TAIEX 與台指期線圖"}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-[11px] text-dashboard-muted">
            {hasTaiex && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-dashboard-accent" />
                TAIEX · TWSE MIS
              </span>
            )}
            {hasTxf && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-dashboard-accent-2" />
                TXF（{data?.session === "night" ? "夜盤" : "日盤"}）· TAIFEX MIS
              </span>
            )}
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
              >
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
                  tickFormatter={formatIntradayAxis}
                  width={68}
                  domain={["auto", "auto"]}
                />
                <Tooltip content={<IntradayTooltip />} />
                {hasTaiex && (
                  <Line
                    type="monotone"
                    dataKey="taiex"
                    name="TAIEX"
                    stroke="var(--color-accent)"
                    strokeWidth={2.2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                  />
                )}
                {hasTxf && (
                  <Line
                    type="monotone"
                    dataKey="txf"
                    name="TXF"
                    stroke="var(--color-accent-2)"
                    strokeWidth={2.2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    connectNulls
                  />
                )}
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
