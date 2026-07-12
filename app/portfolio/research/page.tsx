"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/ui/chip";
import { stubNavSections } from "@/lib/nav-sections";
import { useApi } from "@/lib/hooks/use-api";
import type { PositionSummary } from "@/lib/schemas/portfolio";

interface PortfolioResponse {
  positions: PositionSummary[];
}

export default function ResearchIndexPage() {
  const { data, error, isLoading, mutate } =
    useApi<PortfolioResponse>("/api/portfolio");

  if (isLoading) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "個股研究" }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton key={index} height={130} />
          ))}
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "個股研究" }}>
        <ErrorState
          message={error?.message ?? "無法載入持倉研究清單"}
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  if (data.positions.length === 0) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "個股研究" }}>
        <EmptyState
          title="尚無可研究的持倉"
          description="目前沒有開放中的持倉，因此沒有可開啟的個股研究。"
        />
      </AppShell>
    );
  }

  const positions = [...data.positions].sort((a, b) =>
    a.symbol.localeCompare(b.symbol),
  );

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: "個股研究",
        subtitle: "選擇持倉，查看投資論點、催化劑、風險與交易紀錄",
      }}
    >
      <div className="mb-4 text-[12px] text-dashboard-faint">
        共 {positions.length} 檔開放中持倉
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {positions.map((position) => (
          <Link key={position.symbol} href={`/portfolio/${position.symbol}`}>
            <Card className="h-full transition-colors hover:border-dashboard-border-2 hover:bg-dashboard-chip/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-[12px] text-dashboard-accent">
                    {position.symbol}
                  </div>
                  <h2 className="mt-1 truncate text-[16px] font-semibold text-dashboard-text">
                    {position.name}
                  </h2>
                </div>
                <span className="text-dashboard-faint" aria-hidden="true">
                  →
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {position.sector && (
                  <Chip variant="default">{position.sector}</Chip>
                )}
                {position.theme && (
                  <Chip variant="accent">{position.theme}</Chip>
                )}
                {!position.sector && !position.theme && (
                  <span className="text-[11px] text-dashboard-faint">
                    尚未設定分類
                  </span>
                )}
              </div>
              <p className="mt-4 text-[12px] text-dashboard-muted">
                查看研究與交易紀錄
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
