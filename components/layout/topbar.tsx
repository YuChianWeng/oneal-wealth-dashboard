"use client";

import { useTheme } from "@/components/theme/theme-provider";
import {
  RangeSelector,
  type RangeKey,
} from "@/components/range/range-selector";

export interface TopbarProps {
  /** Page title shown as h1. */
  title: string;
  /** Optional subtitle / freshness line. */
  subtitle?: string;
  /** Optional current-month badge text (e.g. "2026 年 7 月"). */
  monthBadge?: string;
  /** Currently selected range (only rendered when onRangeChange is provided). */
  range?: RangeKey;
  /** Range change handler. If omitted, range selector is hidden. */
  onRangeChange?: (range: RangeKey) => void;
}

/**
 * Sticky top bar with page title, date range selector,
 * theme toggle, Obsidian link (placeholder), and user avatar.
 */
export function Topbar({
  title,
  subtitle,
  monthBadge,
  range,
  onRangeChange,
}: TopbarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className="sticky top-0 z-10 flex flex-wrap items-center gap-[20px] border-b border-dashboard-border px-[30px] py-[16px]"
      style={{
        background: "color-mix(in srgb, var(--color-bg) 86%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* ── Left: title + meta ─────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[11px]">
          <h1 className="m-0 text-[20px] font-semibold tracking-[0.2px]">
            {title}
          </h1>
          {monthBadge ? (
            <span className="inline-block rounded-[20px] border border-dashboard-border px-[8px] py-[3px] font-mono text-[11px] text-dashboard-faint">
              {monthBadge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <div className="mt-[3px] text-[12px] text-dashboard-faint">
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* ── Right: controls ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-[10px]">
        {/* Range selector */}
        {range !== undefined && onRangeChange ? (
          <RangeSelector value={range} onChange={onRangeChange} />
        ) : null}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === "dark" ? "切換淺色模式" : "切換深色模式"}
          aria-label={theme === "dark" ? "切換淺色模式" : "切換深色模式"}
          className="flex h-[36px] w-[38px] cursor-pointer items-center justify-center rounded-[10px] border border-dashboard-border bg-dashboard-surface text-dashboard-muted transition-colors hover:border-dashboard-border-2 hover:text-dashboard-text"
        >
          {theme === "dark" ? (
            /* Sun icon — shown in dark mode to indicate "switch to light" */
            <svg
              width="17"
              height="17"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="3.6" />
              <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4" />
            </svg>
          ) : (
            /* Moon icon — shown in light mode to indicate "switch to dark" */
            <svg
              width="17"
              height="17"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M15.5 10.3A6 6 0 0 1 7.7 2.5 6 6 0 1 0 15.5 10.3Z" />
            </svg>
          )}
        </button>

        {/* Obsidian link — disabled placeholder */}
        <button
          type="button"
          disabled
          title="Obsidian vault 連結待驗證後啟用"
          className="flex h-[36px] cursor-not-allowed items-center gap-[8px] rounded-[10px] border border-dashboard-border bg-dashboard-surface px-[14px] text-[12.5px] font-medium text-dashboard-faint opacity-60"
        >
          <div
            aria-hidden="true"
            className="h-[11px] w-[11px] rotate-45 rounded-[2px] bg-current"
          />
          <span>前往 Obsidian</span>
        </button>

        {/* User avatar */}
        <div
          className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-gradient-to-br from-dashboard-accent-2 to-dashboard-accent text-[13px] font-semibold text-white"
          aria-label="使用者 O"
        >
          O
        </div>
      </div>
    </header>
  );
}
