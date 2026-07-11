"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import type { Insight, InsightSeverity } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_META: Record<
  InsightSeverity,
  {
    color: string;
    glow: string;
    label: string;
    chipClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  "action-needed": {
    color: "var(--color-neg)",
    glow: "color-mix(in srgb, var(--color-neg) 20%, transparent)",
    label: "待處理",
    chipClass:
      "text-dashboard-neg bg-[color-mix(in_srgb,var(--color-neg)_13%,transparent)]",
    bgClass: "bg-[color-mix(in_srgb,var(--color-neg)_6%,transparent)]",
    borderClass: "border-[color-mix(in_srgb,var(--color-neg)_18%,transparent)]",
  },
  notice: {
    color: "var(--color-warn)",
    glow: "color-mix(in srgb, var(--color-warn) 22%, transparent)",
    label: "注意",
    chipClass:
      "text-dashboard-warn bg-[color-mix(in_srgb,var(--color-warn)_14%,transparent)]",
    bgClass: "bg-[color-mix(in_srgb,var(--color-warn)_7%,transparent)]",
    borderClass:
      "border-[color-mix(in_srgb,var(--color-warn)_18%,transparent)]",
  },
  info: {
    color: "var(--color-muted)",
    glow: "color-mix(in srgb, var(--color-muted) 16%, transparent)",
    label: "資訊",
    chipClass:
      "text-dashboard-muted bg-[color-mix(in_srgb,var(--color-muted)_10%,transparent)]",
    bgClass: "bg-[color-mix(in_srgb,var(--color-muted)_4%,transparent)]",
    borderClass:
      "border-[color-mix(in_srgb,var(--color-muted)_14%,transparent)]",
  },
};

const SEVERITY_SORT: Record<InsightSeverity, number> = {
  "action-needed": 0,
  notice: 1,
  info: 2,
};

const FILTER_TABS: { key: InsightSeverity | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "action-needed", label: "待處理" },
  { key: "notice", label: "注意" },
  { key: "info", label: "資訊" },
];

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Filter tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={32} width={80} />
        ))}
      </div>
      {/* Insight cards skeleton */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} height={100} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InsightsPage() {
  const [severityFilter, setSeverityFilter] = useState<InsightSeverity | "all">(
    "all",
  );

  const { data, error, isLoading, mutate } = useSWR<Insight[]>(
    "/api/insights",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "Unknown error");
      return json.data as Insight[];
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30_000,
    },
  );

  // ── Derived ────────────────────────────────────────────────────────

  const insights = useMemo(() => {
    if (!data) return [];
    // Sort by severity (action-needed > notice > info)
    return [...data].sort(
      (a, b) => SEVERITY_SORT[a.severity] - SEVERITY_SORT[b.severity],
    );
  }, [data]);

  const filteredInsights = useMemo(() => {
    if (severityFilter === "all") return insights;
    return insights.filter((i) => i.severity === severityFilter);
  }, [insights, severityFilter]);

  const severityCounts = useMemo(() => {
    const counts: Record<InsightSeverity | "all", number> = {
      all: data?.length ?? 0,
      "action-needed": 0,
      notice: 0,
      info: 0,
    };
    if (data) {
      for (const ins of data) {
        counts[ins.severity] = (counts[ins.severity] ?? 0) + 1;
      }
    }
    return counts;
  }, [data]);

  const now = useMemo(() => new Date(), []);

  const topbarSubtitle = useMemo(() => {
    const timeStr = now.toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    });
    const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return `最後更新 · ${dateStr} ${timeStr}`;
  }, [now]);

  // ── Loading ────────────────────────────────────────────────────────

  if (isLoading && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "Insights" }}>
        <InsightsSkeleton />
      </AppShell>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "Insights" }}>
        <ErrorState
          message={
            error instanceof Error ? error.message : "載入 Insights 時發生錯誤"
          }
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────

  if (data && data.length === 0) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "Insights", subtitle: topbarSubtitle }}
      >
        <EmptyState
          title="目前沒有任何 Insights"
          description="當系統偵測到需要注意的事項時，會在這裡顯示。"
        />
      </AppShell>
    );
  }

  // ── Has data ───────────────────────────────────────────────────────

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{ title: "Insights", subtitle: topbarSubtitle }}
    >
      {/* ── Filter tabs ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-[6px]">
        {FILTER_TABS.map((tab) => {
          const active = severityFilter === tab.key;
          const count = severityCounts[tab.key];
          const meta =
            tab.key !== "all"
              ? SEVERITY_META[tab.key as InsightSeverity]
              : null;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSeverityFilter(tab.key)}
              className={`rounded-[20px] border px-[14px] py-[6px] text-[12.5px] font-medium transition-colors ${
                active
                  ? meta
                    ? `${meta.chipClass} border-transparent`
                    : "bg-dashboard-chip border-dashboard-border-2 text-dashboard-text"
                  : "border-dashboard-border bg-transparent text-dashboard-muted hover:bg-dashboard-chip hover:text-dashboard-text"
              }`}
            >
              {tab.label}
              <span className="ml-[6px] opacity-50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Insight cards ────────────────────────────────────────── */}
      {filteredInsights.length === 0 ? (
        <EmptyState
          title="此類別尚無 Insights"
          description={`目前沒有「${severityFilter === "all" ? "全部" : SEVERITY_META[severityFilter].label}」層級的注意事項。`}
        />
      ) : (
        <div className="flex flex-col gap-[14px]">
          {filteredInsights.map((insight) => {
            const meta = SEVERITY_META[insight.severity];
            return (
              <Card
                key={insight.id}
                className={meta.bgClass}
                style={{
                  borderColor: `var(--color-${insight.severity === "action-needed" ? "neg" : insight.severity === "notice" ? "warn" : "muted"})`,
                }}
              >
                <div className="flex items-start gap-[14px]">
                  {/* Severity icon */}
                  <div
                    className="flex h-[28px] w-[28px] flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{
                      background: meta.color,
                      color:
                        insight.severity === "info"
                          ? "var(--color-text)"
                          : "#fff",
                      boxShadow: `0 0 0 5px ${meta.glow}`,
                    }}
                  >
                    {insight.severity === "action-needed"
                      ? "!"
                      : insight.severity === "notice"
                        ? "!"
                        : "i"}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-[8px]">
                      <h3 className="text-[14px] font-semibold">
                        {insight.title}
                      </h3>
                      <span
                        className={`rounded-[20px] px-[7px] py-[2px] font-mono text-[10.5px] ${meta.chipClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-[6px] text-[12.5px] leading-[1.5] text-dashboard-muted">
                      {insight.description}
                    </p>

                    {/* Drill-through link */}
                    <div className="mt-[10px] flex items-center gap-[10px]">
                      <Link
                        href={insight.drillThroughUrl}
                        className="inline-flex items-center gap-[5px] rounded-[7px] border border-dashboard-border-2 bg-transparent px-[12px] py-[5px] text-[12px] text-dashboard-muted transition-colors hover:bg-dashboard-chip hover:text-dashboard-text"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden="true"
                        >
                          <path d="M6 3h7v7M13 3L3 13" />
                        </svg>
                        查看詳情
                      </Link>
                      <span className="text-[10.5px] text-dashboard-faint">
                        {insight.generatedAt}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
