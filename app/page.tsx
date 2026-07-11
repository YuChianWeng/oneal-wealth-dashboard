"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import type { NavSection } from "@/components/layout/sidebar";
import type { RangeKey } from "@/components/range/range-selector";
import { EmptyState } from "@/components/ui/empty-state";

// ---------------------------------------------------------------------------
// Navigation structure (matches design + route plan)
// ---------------------------------------------------------------------------

const NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [{ label: "首頁總覽", href: "/", icon: null }],
  },
  {
    label: "財務 Finance",
    items: [
      { label: "收支分析", href: "/finance", icon: null, activePrefix: true },
      {
        label: "帳戶與負債",
        href: "/finance/accounts",
        icon: null,
      },
      {
        label: "月度回顧",
        href: "/finance/reviews",
        icon: null,
      },
    ],
  },
  {
    label: "投資 Portfolio",
    items: [
      {
        label: "持倉總覽",
        href: "/portfolio",
        icon: null,
        activePrefix: true,
      },
      {
        label: "個股研究",
        href: "/portfolio/symbol",
        icon: null,
        activePrefix: true,
      },
      {
        label: "交易紀錄",
        href: "/portfolio/transactions",
        icon: null,
      },
      {
        label: "績效比較",
        href: "/portfolio/performance",
        icon: null,
      },
    ],
  },
  {
    label: "成長 · 其他",
    items: [
      {
        label: "淨資產成長",
        href: "/growth",
        icon: null,
        activePrefix: true,
      },
      { label: "財務健康", href: "/insights", icon: null },
      {
        label: "Insights",
        href: "/insights",
        icon: null,
      },
    ],
  },
];

export default function Home() {
  const [range, setRange] = useState<RangeKey>("3M");

  return (
    <AppShell
      navSections={NAV_SECTIONS}
      topbar={{
        title: "總覽",
        subtitle: "最後同步 · 07-11 14:30 · 3 個資料來源",
        monthBadge: "2026 年 7 月",
        range,
        onRangeChange: setRange,
      }}
      financeLastSync="07-11 14:30"
      priceLastSync="07-11 14:00"
      warningCount={2}
    >
      {/* Placeholder body — will be replaced by Task 4+ modules */}
      <EmptyState
        title="儀表板內容即將推出"
        description="首頁總覽模組正在開發中，敬請期待。"
      />
    </AppShell>
  );
}
