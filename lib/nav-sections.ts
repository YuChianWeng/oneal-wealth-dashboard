import type { NavSection } from "@/components/layout/sidebar";

/**
 * Shared navigation structure used by route stubs and the main page.
 * Keep in sync with app/page.tsx.
 */
export const stubNavSections: NavSection[] = [
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
      { label: "持倉總覽", href: "/portfolio", icon: null },
      {
        label: "投資對帳",
        href: "/portfolio/reconciliation",
        icon: null,
      },
      {
        label: "個股研究",
        href: "/portfolio/research",
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
      { label: "財務健康", href: "/growth", icon: null },
      { label: "Insights", href: "/insights", icon: null },
    ],
  },
];
