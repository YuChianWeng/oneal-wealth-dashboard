"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./sidebar";

// Mini SVG icons (compact versions for bottom nav)
function IconDashboardMini() {
  return (
    <svg
      width="20"
      height="20"
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
  );
}

function IconFinanceMini() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="1.7" y="4" width="14.6" height="10" rx="2" />
      <path d="M1.7 7.4h14.6" />
    </svg>
  );
}

function IconPortfolioMini() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2.5 12.5 6.5 8l3 2.6L15.5 5" />
      <path d="M11.6 5h3.9v3.8" />
    </svg>
  );
}

function IconGrowthMini() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2.5 13.5 7 7l3 2.7 5.5-6.2" />
      <path d="M15.5 6V3.5H13" />
    </svg>
  );
}

function IconMoreMini() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7" />
      <path d="M9 4.6v4.4l3 1.8" />
    </svg>
  );
}

const MOBILE_NAV_ICONS: Record<string, React.FC> = {
  首頁總覽: IconDashboardMini,
  收支分析: IconFinanceMini,
  持倉總覽: IconPortfolioMini,
  淨資產成長: IconGrowthMini,
  月度回顧: IconMoreMini,
};

const MOBILE_SHORT_LABELS: Record<string, string> = {
  首頁總覽: "首頁",
  收支分析: "財務",
  持倉總覽: "投資",
  淨資產成長: "成長",
  月度回顧: "更多",
};

/**
 * Primary mobile nav items — a curated subset of the full sidebar nav.
 */
const MOBILE_ITEMS: NavItem[] = [
  { label: "首頁總覽", href: "/", icon: null },
  { label: "收支分析", href: "/finance", icon: null, activePrefix: true },
  { label: "持倉總覽", href: "/portfolio", icon: null, activePrefix: true },
  { label: "淨資產成長", href: "/growth", icon: null, activePrefix: true },
  { label: "月度回顧", href: "/finance/reviews", icon: null },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-dashboard-border bg-dashboard-bg/95 backdrop-blur-[10px] md:hidden"
      aria-label="行動版導航"
    >
      {MOBILE_ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (!!item.activePrefix && pathname.startsWith(item.href + "/"));
        const IconComp = MOBILE_NAV_ICONS[item.label] ?? null;
        const shortLabel = MOBILE_SHORT_LABELS[item.label] ?? item.label;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-[2px] px-[6px] py-[6px] text-[10px] transition-colors ${
              active
                ? "text-dashboard-accent"
                : "text-dashboard-faint hover:text-dashboard-muted"
            }`}
          >
            {IconComp ? <IconComp /> : null}
            <span className="font-medium">{shortLabel}</span>
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-0 h-[3px] w-[24px] rounded-b-full bg-dashboard-accent"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
