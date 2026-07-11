"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { stubNavSections } from "@/lib/nav-sections";
import { useReviews } from "@/lib/hooks/use-finance";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y} 年 ${parseInt(m, 10)} 月`;
}

function getQuarter(m: number): string {
  if (m <= 3) return "Q1";
  if (m <= 6) return "Q2";
  if (m <= 9) return "Q3";
  return "Q4";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ReviewsSkeleton() {
  return (
    <div className="flex flex-col gap-[14px]">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} height={72} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReviewsPage() {
  const { data, error, isLoading, isValidating, mutate } = useReviews();

  if (isLoading) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "月度回顧", subtitle: "載入中…" }}
      >
        <ReviewsSkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "月度回顧", subtitle: "資料載入失敗" }}
      >
        <ErrorState
          message="無法載入月度回顧列表，請檢查資料來源或稍後再試。"
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  const months = data?.months ?? [];

  if (months.length === 0) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "月度回顧", subtitle: "尚無資料" }}
      >
        <EmptyState
          title="尚無月度回顧"
          description="目前沒有任何月份的財務記錄可供回顧。"
        />
      </AppShell>
    );
  }

  const grouped: Record<string, string[]> = {};
  for (const m of months) {
    const year = m.slice(0, 4);
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(m);
  }
  const years = Object.keys(grouped).sort().reverse();

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: "月度回顧",
        subtitle: isValidating
          ? "更新中…"
          : `${months.length} 個月份可供回顧`,
      }}
    >
      <div className="flex flex-col gap-[28px]">
        {years.map((year) => (
          <div key={year} className="flex flex-col gap-[10px]">
            <h2 className="text-[15px] font-semibold text-dashboard-muted">
              {year} 年
            </h2>
            <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-3">
              {grouped[year].map((m) => {
                const monthNum = parseInt(m.slice(5, 7), 10);
                return (
                  <a
                    key={m}
                    href={`/finance?month=${m}`}
                    className="group block"
                  >
                    <Card className="transition-colors hover:border-dashboard-border-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-[12px]">
                          <div className="flex h-[44px] w-[44px] items-center justify-center rounded-ds-md bg-dashboard-chip">
                            <span className="font-mono-dashboard text-[18px] font-semibold text-dashboard-accent">
                              {monthNum}
                            </span>
                          </div>
                          <div>
                            <div className="text-[13.5px] font-medium text-dashboard-text group-hover:text-white">
                              {formatMonthLabel(m)}
                            </div>
                            <div className="mt-[2px] text-[11px] text-dashboard-faint">
                              收支明細 · 分類分析
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-[8px]">
                          <span className="rounded-ds-pill bg-dashboard-chip px-[8px] py-[3px] font-mono text-[10.5px] text-dashboard-muted">
                            {getQuarter(monthNum)}
                          </span>
                          <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="text-dashboard-faint group-hover:text-dashboard-text"
                          >
                            <path d="M6 3l5 5-5 5" />
                          </svg>
                        </div>
                      </div>
                    </Card>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {isValidating && (
        <div className="mt-[16px] text-center text-[11px] text-dashboard-faint">
          正在更新資料…
        </div>
      )}
    </AppShell>
  );
}
