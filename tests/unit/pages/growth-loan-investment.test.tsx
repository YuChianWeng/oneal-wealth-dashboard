import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { LoanInvestmentPerformanceCard } from "@/app/growth/growth-page";
import type { LoanInvestmentPerformance } from "@/lib/data/loan-investment-repository";

afterEach(cleanup);

const performance: LoanInvestmentPerformance = {
  startDate: "2026-06-20",
  firstObservationDate: "2026-06-21",
  initialPrincipal: 200_000,
  strategyLabel: "保單借款投資池",
  benchmarkLabel: "TAIEX",
  points: [
    {
      date: "2026-06-20",
      strategyValue: 200_000,
      strategyReturnPct: 0,
      taiexClose: 22_000,
      taiexReturnPct: 0,
      taiexSnapshotDate: "2026-06-20",
      isSeed: true,
      cashAsOfDate: null,
      confirmedCash: null,
      cashAsOfSource: "unavailable",
      cashAsOfQuality: "unavailable",
      pendingTradeCashAdjustment: 0,
      pendingTradeCount: 0,
      effectiveCashValue: null,
      brokerageMarketValue: null,
    },
    {
      date: "2026-07-13",
      strategyValue: 202_735.7,
      strategyReturnPct: 1.36785,
      taiexClose: 23_000,
      taiexReturnPct: 1.1,
      taiexSnapshotDate: "2026-07-13",
      isSeed: false,
      cashAsOfDate: "2026-07-12",
      confirmedCash: 44_847,
      cashAsOfSource: "weekly-balance-md-cron",
      cashAsOfQuality: "confirmed-explicit-event",
      pendingTradeCashAdjustment: 8_743,
      pendingTradeCount: 1,
      effectiveCashValue: 53_590,
      brokerageMarketValue: 149_145.7,
    },
  ],
};

describe("LoanInvestmentPerformanceCard reconciliation bridge", () => {
  it("shows confirmed, pending, effective, holdings, and per-account freshness", () => {
    render(<LoanInvestmentPerformanceCard performance={performance} />);

    expect(screen.getByText("已確認現金")).toBeTruthy();
    expect(screen.getByText("NT$44,847")).toBeTruthy();
    expect(screen.getByText("未交割調整")).toBeTruthy();
    expect(screen.getByText("+NT$8,743")).toBeTruthy();
    expect(screen.getByText("有效現金")).toBeTruthy();
    expect(screen.getByText("NT$53,590")).toBeTruthy();
    expect(screen.getByText("持股市值")).toBeTruthy();
    expect(screen.getByText("NT$149,146")).toBeTruthy();
    expect(screen.getByText(/截至 2026-07-12 · 明確確認/)).toBeTruthy();
    expect(screen.getByText("前往投資對帳中心")).toBeTruthy();
  });
});
