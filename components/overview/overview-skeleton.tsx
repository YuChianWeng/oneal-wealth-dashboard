"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading skeleton for the Overview dashboard.
 *
 * Mirrors the layout of the real page so the transition from
 * loading → loaded feels smooth.
 */
export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-[22px]">
      {/* KPI cards row */}
      <section className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[18px_19px] shadow-ds-card"
          >
            <Skeleton height={14} width="40%" />
            <div className="mt-[14px]">
              <Skeleton height={30} width="70%" />
            </div>
            <div className="mt-[12px]">
              <Skeleton height={14} width="50%" />
            </div>
          </div>
        ))}
      </section>

      {/* Chart + Allocation row */}
      <section className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.72fr_1fr]">
        <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px_16px] shadow-ds-card">
          <Skeleton height={18} width="30%" />
          <div className="mt-[4px]">
            <Skeleton height={12} width="20%" />
          </div>
          <div className="mt-[18px]">
            <Skeleton height={240} />
          </div>
        </div>

        <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
          <Skeleton height={18} width="40%" />
          <div className="mt-[10px] flex items-center gap-[6px]">
            <Skeleton height={150} width={150} rounded="50%" />
            <div className="flex flex-1 flex-col gap-[12px]">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={14} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Insights + Cash flow row */}
      <section className="grid grid-cols-1 gap-[16px] lg:grid-cols-[1.72fr_1fr]">
        <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
          <Skeleton height={18} width="30%" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="mt-[16px] flex items-center gap-[13px]">
              <Skeleton height={8} width={8} circle />
              <div className="flex-1">
                <Skeleton height={14} width="80%" />
                <div className="mt-[4px]">
                  <Skeleton height={11} width="40%" />
                </div>
              </div>
              <Skeleton height={30} width={60} />
            </div>
          ))}
        </div>

        <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
          <Skeleton height={18} width="40%" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mt-[16px]">
              <Skeleton height={20} />
            </div>
          ))}
          <div className="mt-[20px]">
            <Skeleton height={14} width="30%" />
            <div className="mt-[10px]">
              <Skeleton height={7} />
            </div>
          </div>
        </div>
      </section>

      {/* Data status row */}
      <div className="rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[20px_22px] shadow-ds-card">
        <Skeleton height={16} width="25%" />
        <div className="mt-[12px] grid grid-cols-2 gap-[12px] sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={14} />
          ))}
        </div>
      </div>
    </div>
  );
}
