"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import type { NavSection } from "@/components/layout/sidebar";

const NAV_SECTIONS: NavSection[] = [
  {
    label: "",
    items: [{ label: "首頁總覽", href: "/", icon: null }],
  },
  {
    label: "財務 Finance",
    items: [
      { label: "收支分析", href: "/finance", icon: null, activePrefix: true },
      { label: "帳戶與負債", href: "/finance/accounts", icon: null },
      { label: "月度回顧", href: "/finance/reviews", icon: null },
    ],
  },
  {
    label: "投資 Portfolio",
    items: [
      { label: "持倉總覽", href: "/portfolio", icon: null, activePrefix: true },
      {
        label: "個股研究",
        href: "/portfolio/symbol",
        icon: null,
        activePrefix: true,
      },
      { label: "交易紀錄", href: "/portfolio/transactions", icon: null },
      { label: "績效比較", href: "/portfolio/performance", icon: null },
    ],
  },
  {
    label: "成長 · 其他",
    items: [
      { label: "淨資產成長", href: "/growth", icon: null, activePrefix: true },
      { label: "財務健康", href: "/insights", icon: null },
      { label: "Insights", href: "/insights", icon: null },
    ],
  },
];

export default function NotFound() {
  return (
    <AppShell navSections={NAV_SECTIONS} topbar={{ title: "找不到頁面" }}>
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        {/* Large 404 */}
        <p
          className="font-mono text-[72px] font-bold leading-none tracking-[-2px] text-dashboard-surface-2"
          aria-hidden="true"
        >
          404
        </p>
        <h1 className="text-[18px] font-semibold text-dashboard-text">
          找不到此頁面
        </h1>
        <p className="max-w-[320px] text-[13px] text-dashboard-muted">
          您所尋找的頁面可能已被移動、刪除，或網址輸入錯誤。
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-[6px] rounded-ds-sm border border-dashboard-border-2 bg-dashboard-surface px-[14px] py-[7px] text-[13px] text-dashboard-muted transition-colors hover:bg-dashboard-chip hover:text-dashboard-text"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="1.5" y="1.5" width="6" height="6" rx="1.4" />
            <rect x="10.5" y="1.5" width="6" height="6" rx="1.4" />
            <rect x="1.5" y="10.5" width="6" height="6" rx="1.4" />
            <rect x="10.5" y="10.5" width="6" height="6" rx="1.4" />
          </svg>
          回到首頁
        </Link>
      </div>
    </AppShell>
  );
}
