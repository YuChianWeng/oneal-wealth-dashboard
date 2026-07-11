"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/layout/app-shell";
import { stubNavSections } from "@/lib/nav-sections";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { formatRelativeFreshness } from "@/lib/format";
import type { SourceHealth, HealthStatus } from "@/lib/source-health";

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

interface DataStatusResponse {
  sources: SourceHealth[];
  overallStatus: HealthStatus;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const HEALTH_LABELS: Record<HealthStatus, string> = {
  healthy: "正常",
  degraded: "部分異常",
  unavailable: "無法使用",
};

const HEALTH_VARIANTS: Record<HealthStatus, StatusVariant> = {
  healthy: "positive",
  degraded: "warning",
  unavailable: "negative",
};

const SOURCE_LABELS: Record<string, string> = {
  "finance-db": "財務資料庫",
  "obsidian-vault": "Obsidian 知識庫",
};

function sourceVariant(source: SourceHealth): StatusVariant {
  if (source.errorCode) return "negative";
  if (source.warningCount > 0) return "warning";
  return "positive";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DataStatusSkeleton() {
  return (
    <>
      <Skeleton height={80} />
      <Skeleton height={200} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DataStatusPage() {
  const { data, error, isLoading, mutate } = useSWR<DataStatusResponse>(
    "/api/data-status",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? "Unknown error");
      return json.data as DataStatusResponse;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 30_000,
    },
  );

  const now = useMemo(() => new Date(), []);

  // ── Loading ────────────────────────────────────────────────────────

  if (isLoading && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "資料狀態" }}>
        <DataStatusSkeleton />
      </AppShell>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "資料狀態" }}>
        <ErrorState
          message={
            error instanceof Error ? error.message : "載入資料狀態時發生錯誤"
          }
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────

  if (data && data.sources.length === 0) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "資料狀態" }}>
        <EmptyState
          title="尚無資料來源"
          description="目前沒有任何已設定的資料來源。請確認設定檔是否正確。"
        />
      </AppShell>
    );
  }

  // ── Has data ───────────────────────────────────────────────────────

  const overallStatus = data?.overallStatus ?? "unavailable";

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: "資料狀態",
        subtitle: `最後檢查 · ${now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Taipei" })}`,
      }}
    >
      {/* ── Overall health ────────────────────────────────────────── */}
      <Card
        header={
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">系統整體狀態</h2>
          </div>
        }
      >
        <div className="flex items-center gap-[14px]">
          <div
            className={`flex h-[48px] w-[48px] items-center justify-center rounded-full`}
            style={{
              background:
                overallStatus === "healthy"
                  ? "color-mix(in srgb, var(--color-pos) 15%, transparent)"
                  : overallStatus === "degraded"
                    ? "color-mix(in srgb, var(--color-warn) 15%, transparent)"
                    : "color-mix(in srgb, var(--color-neg) 15%, transparent)",
            }}
          >
            <StatusBadge variant={HEALTH_VARIANTS[overallStatus]} label="" />
          </div>
          <div>
            <div className="text-[16px] font-semibold">
              {HEALTH_LABELS[overallStatus]}
            </div>
            <div className="mt-[2px] text-[12px] text-dashboard-faint">
              {data?.sources.length ?? 0} 個資料來源 · 最後檢查{" "}
              {data?.generatedAt
                ? formatRelativeFreshness(data.generatedAt)
                : "—"}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Source health table ───────────────────────────────────── */}
      <Card
        header={<h2 className="text-[15px] font-semibold">資料來源健康狀態</h2>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-dashboard-border">
                <th className="pb-[10px] pr-4 text-[11px] font-medium uppercase tracking-[0.5px] text-dashboard-faint">
                  來源
                </th>
                <th className="pb-[10px] pr-4 text-[11px] font-medium uppercase tracking-[0.5px] text-dashboard-faint">
                  狀態
                </th>
                <th className="pb-[10px] pr-4 text-[11px] font-medium uppercase tracking-[0.5px] text-dashboard-faint text-right">
                  筆數
                </th>
                <th className="pb-[10px] pr-4 text-[11px] font-medium uppercase tracking-[0.5px] text-dashboard-faint">
                  最後更新
                </th>
                <th className="pb-[10px] text-[11px] font-medium uppercase tracking-[0.5px] text-dashboard-faint text-right">
                  警告
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.sources.map((source) => {
                const variant = sourceVariant(source);
                return (
                  <tr
                    key={source.sourceName}
                    className="border-b border-dashboard-border last:border-b-0"
                  >
                    <td className="py-[11px] pr-4 text-[13px] font-medium">
                      {SOURCE_LABELS[source.sourceName] ?? source.sourceName}
                    </td>
                    <td className="py-[11px] pr-4">
                      <StatusBadge
                        variant={variant}
                        label={
                          source.errorCode
                            ? "異常"
                            : source.warningCount > 0
                              ? "有警告"
                              : "正常"
                        }
                      />
                    </td>
                    <td className="py-[11px] pr-4 text-right font-mono text-[13px]">
                      {source.recordCount.toLocaleString()}
                    </td>
                    <td className="py-[11px] pr-4 font-mono text-[12px] text-dashboard-faint">
                      {source.lastSuccessfulReadAt
                        ? formatRelativeFreshness(source.lastSuccessfulReadAt)
                        : "—"}
                    </td>
                    <td className="py-[11px] text-right font-mono text-[12px]">
                      {source.warningCount > 0 ? (
                        <span className="text-dashboard-warn">
                          {source.warningCount}
                        </span>
                      ) : source.errorCode ? (
                        <span className="text-dashboard-neg">—</span>
                      ) : (
                        <span className="text-dashboard-pos">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data?.sources && data.sources.length === 0 && (
          <div className="py-[30px] text-center text-[12px] text-dashboard-faint">
            尚無資料來源資訊
          </div>
        )}
      </Card>

      {/* ── Source details ────────────────────────────────────────── */}
      {data?.sources
        .filter((s) => s.errorCode || s.warningCount > 0)
        .map((source) => (
          <Card key={`detail-${source.sourceName}`}>
            <div className="flex items-start gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="mt-[2px] flex-shrink-0 text-dashboard-warn"
              >
                <circle cx="9" cy="9" r="7" />
                <line x1="9" y1="5.5" x2="9" y2="9.5" />
                <circle cx="9" cy="12" r="0.7" fill="currentColor" />
              </svg>
              <div>
                <p className="text-[13px] font-medium text-dashboard-muted">
                  {SOURCE_LABELS[source.sourceName] ?? source.sourceName}{" "}
                  {source.errorCode ? "發生錯誤" : "需要注意"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-dashboard-faint">
                  {source.errorCode
                    ? `錯誤代碼：${source.errorCode}。請檢查資料來源是否可存取。`
                    : `有 ${source.warningCount} 筆資料可能需要檢查或補充資訊。`}
                </p>
              </div>
            </div>
          </Card>
        ))}
    </AppShell>
  );
}
