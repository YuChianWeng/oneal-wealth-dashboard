"use client";

import type { ReactNode } from "react";
import { Sidebar, type NavSection } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { Topbar, type TopbarProps } from "./topbar";

export interface AppShellProps {
  /** Navigation sections for the sidebar. */
  navSections: NavSection[];
  /** Props forwarded to Topbar. */
  topbar: TopbarProps;
  /** Main content rendered below the topbar. */
  children: ReactNode;
  /** Data-status props for the sidebar footer card. */
  financeLastSync?: string;
  priceLastSync?: string;
  warningCount?: number;
  warningLabel?: string;
}

/**
 * Responsive app shell combining Sidebar + Topbar + MobileNav + main content.
 *
 * Desktop (md+): sticky left sidebar + scrollable main area.
 * Mobile (<md): topbar + scrollable main + fixed bottom nav.
 */
export function AppShell({
  navSections,
  topbar,
  children,
  financeLastSync,
  priceLastSync,
  warningCount,
  warningLabel,
}: AppShellProps) {
  return (
    <div className="flex min-h-screen w-full bg-dashboard-bg text-dashboard-text">
      {/* ── Desktop sidebar ────────────────────────────────────── */}
      <Sidebar
        navSections={navSections}
        financeLastSync={financeLastSync}
        priceLastSync={priceLastSync}
        warningCount={warningCount}
        warningLabel={warningLabel}
      />

      {/* ── Main area ──────────────────────────────────────────── */}
      <main className="scroll-y min-w-0 flex-1 overflow-y-auto md:h-screen">
        <Topbar {...topbar} />

        {/* Content: extra bottom padding on mobile for the fixed bottom nav */}
        <div className="px-[30px] pb-[40px] pt-[26px] md:pb-[40px] pb-[80px]">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-[22px]">
            {children}
          </div>
        </div>
      </main>

      {/* ── Mobile bottom nav ──────────────────────────────────── */}
      <MobileNav />
    </div>
  );
}
