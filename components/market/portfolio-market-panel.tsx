"use client";

import { IntradayLineChart } from "@/components/market/intraday-line-chart";
import { LiveMarketTicker } from "@/components/market/live-market-ticker";

/** Portfolio-only market surface: live cards plus today's day-session chart. */
export function PortfolioMarketPanel() {
  return (
    <div className="flex flex-col gap-[22px]">
      <LiveMarketTicker />
      <IntradayLineChart />
    </div>
  );
}
