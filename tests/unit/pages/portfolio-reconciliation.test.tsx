import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockUseApi } = vi.hoisted(() => ({ mockUseApi: vi.fn() }));

vi.mock("@/lib/hooks/use-api", () => ({ useApi: mockUseApi }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/portfolio/reconciliation",
}));

import { ReconciliationPage } from "@/app/portfolio/reconciliation/reconciliation-page";
import { stubNavSections } from "@/lib/nav-sections";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const data = {
  valuationDate: "2026-07-13",
  confirmedCash: 44_847,
  cashAsOfDate: "2026-07-12",
  cashAsOfSource: "weekly-balance-md-cron",
  cashAsOfQuality: "confirmed-explicit-event" as const,
  pendingTradeCashAdjustment: 8_743,
  effectiveCashValue: 53_590,
  holdingsMarketValue: 149_145.7,
  strategyValue: 202_735.7,
  pendingSettlements: [
    {
      id: "2026-07-13-2330.TW-sell",
      symbol: "2330.TW",
      side: "sell" as const,
      tradeDate: "2026-07-13",
      settlementDate: "2026-07-15",
      netCashflow: 8_743,
      effectiveCashAdjustment: 8_743,
      ageTradingDays: 0,
      status: "pending" as const,
    },
  ],
  status: "reconciled" as const,
  warnings: [],
};

describe("ReconciliationPage", () => {
  it("shows the auditable cash bridge, freshness, and pending settlement", () => {
    mockUseApi.mockReturnValue({
      data,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<ReconciliationPage />);

    expect(screen.getByText("投資對帳中心")).toBeTruthy();
    expect(screen.getByText("現金對帳公式")).toBeTruthy();
    expect(screen.getByText("NT$44,847")).toBeTruthy();
    expect(screen.getAllByText("+NT$8,743")).toHaveLength(2);
    expect(screen.getByText("NT$202,736")).toBeTruthy();
    expect(screen.getByText("2026-07-12")).toBeTruthy();
    expect(screen.getByText("明確確認")).toBeTruthy();
    expect(screen.getByText("2330.TW")).toBeTruthy();
    expect(screen.getByText("待交割")).toBeTruthy();
  });

  it("adds a dedicated, non-placeholder navigation target", () => {
    const portfolio = stubNavSections.find(
      (section) => section.label === "投資 Portfolio",
    );
    expect(portfolio?.items).toContainEqual(
      expect.objectContaining({
        label: "投資對帳",
        href: "/portfolio/reconciliation",
      }),
    );
  });
});
