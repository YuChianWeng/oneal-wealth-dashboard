"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DataStatusCard } from "./data-status-card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Match prefix for active detection. If omitted, uses exact match. */
  activePrefix?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export interface SidebarProps {
  navSections: NavSection[];
  /** Passed through to DataStatusCard. */
  financeLastSync?: string;
  priceLastSync?: string;
  warningCount?: number;
  warningLabel?: string;
}

// ---------------------------------------------------------------------------
// SVG Icons (inline, from the design HTML)
// ---------------------------------------------------------------------------

function IconDashboard() {
  return (
    <svg
      width="17"
      height="17"
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

function IconFinanceAnalyze() {
  return (
    <svg
      width="17"
      height="17"
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

function IconAccounts() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2.4 14V8.5M6.8 14V5M11.2 14V9.7M15.6 14V4" />
    </svg>
  );
}

function IconReviews() {
  return (
    <svg
      width="17"
      height="17"
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

function IconPortfolio() {
  return (
    <svg
      width="17"
      height="17"
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

function IconStockResearch() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5.6" />
      <path d="M12.2 12.2 16 16" />
    </svg>
  );
}

function IconTransactions() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M3 4.5h12M3 9h12M3 13.5h8" />
    </svg>
  );
}

function IconPnl() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M3 13.5V6.8M7 13.5V9M11 13.5V4.5M15 13.5V2.8" />
      <path d="M2.5 15.5h13" />
    </svg>
  );
}

function IconPerformance() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2.5 9h3l2-4 3 8 2-5 1.5 1h1.5" />
    </svg>
  );
}

function IconGrowth() {
  return (
    <svg
      width="17"
      height="17"
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

function IconHealth() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="7" />
      <circle cx="9" cy="9" r="2.4" />
    </svg>
  );
}

function IconInsights() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.3" />
      <path d="M9 8.4V13" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Nav section label → heading component map
// ---------------------------------------------------------------------------

const NAV_SECTION_ICONS: Record<string, React.FC> = {
  首頁總覽: IconDashboard,
  收支分析: IconFinanceAnalyze,
  帳戶與負債: IconAccounts,
  月度回顧: IconReviews,
  持倉總覽: IconPortfolio,
  個股研究: IconStockResearch,
  交易紀錄: IconTransactions,
  損益分析: IconPnl,
  績效比較: IconPerformance,
  淨資產成長: IconGrowth,
  財務健康: IconHealth,
  Insights: IconInsights,
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function isActive(pathname: string, item: NavItem): boolean {
  if (item.activePrefix) {
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }
  return pathname === item.href;
}

export function Sidebar({
  navSections,
  financeLastSync,
  priceLastSync,
  warningCount,
  warningLabel,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="hidden h-screen w-[248px] flex-shrink-0 flex-col border-r border-dashboard-border bg-dashboard-bg md:flex"
      style={{ position: "sticky", top: 0 }}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-[11px] border-b border-dashboard-border px-[20px] py-[20px] pb-[18px]">
        <div className="flex h-[32px] w-[32px] flex-shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-dashboard-accent to-dashboard-accent-2">
          <div className="h-[12px] w-[12px] rotate-45 rounded-[3px] border-2 border-white/90" />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-[1.1] tracking-[0.2px]">
            Oneal Wealth
          </div>
          <div className="font-mono text-[11px] tracking-[0.3px] text-dashboard-faint">
            個人財務儀表板
          </div>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="scroll-y flex flex-1 flex-col gap-[2px] overflow-y-auto px-[12px] py-[14px]">
        {navSections.map((section) => {
          // If the section has exactly one item with icon "IconDashboard",
          // it's the overview — render without a heading label.
          const isOverview = section.items.length === 1 && section.label === "";

          return (
            <div key={section.label || "__overview__"}>
              {!isOverview && (
                <div className="px-[11px] pb-[7px] pt-[16px] font-mono text-[10.5px] uppercase tracking-[1.4px] text-dashboard-faint">
                  {section.label}
                </div>
              )}

              {section.items.map((item) => {
                const active = isActive(pathname, item);
                const IconComp = NAV_SECTION_ICONS[item.label] ?? null;

                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={`relative flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[14px] font-medium transition-colors ${
                      active
                        ? "bg-dashboard-chip text-dashboard-text"
                        : "text-dashboard-muted hover:bg-dashboard-chip hover:text-dashboard-text"
                    }`}
                  >
                    {/* Active accent bar — 3px wide, accent colour, left edge */}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-[9px] left-0 top-[9px] w-[3px] rounded-[3px] bg-dashboard-accent"
                      />
                    )}
                    {IconComp ? <IconComp /> : null}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* ── Footer: data-status card ──────────────────────────── */}
      <div className="border-t border-dashboard-border p-[14px]">
        <DataStatusCard
          financeLastSync={financeLastSync}
          priceLastSync={priceLastSync}
          warningCount={warningCount}
          warningLabel={warningLabel}
        />
      </div>
    </aside>
  );
}
