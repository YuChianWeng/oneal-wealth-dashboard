"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { formatTWD } from "@/lib/format";
import { useApi } from "@/lib/hooks/use-api";
import { stubNavSections } from "@/lib/nav-sections";
import type {
  InvestmentReconciliation,
  PendingSettlement,
} from "@/lib/schemas/reconciliation";

const API_PATH = "/api/portfolio/reconciliation";

function signedTwd(value: number): string {
  if (value > 0) return `+${formatTWD(value)}`;
  if (value < 0) return `−${formatTWD(Math.abs(value))}`;
  return formatTWD(0);
}

function signedPlain(value: number): string {
  if (value > 0) return `+${value.toLocaleString("en-US")}`;
  if (value < 0) return `−${Math.abs(value).toLocaleString("en-US")}`;
  return "0";
}

function statusLabel(status: PendingSettlement["status"]): string {
  if (status === "pending") return "待交割";
  if (status === "overdue") return "已逾期";
  if (status === "finance-settled") return "已入帳";
  return "已涵蓋";
}

function statusVariant(status: PendingSettlement["status"]): StatusVariant {
  if (status === "overdue") return "warning";
  if (status === "pending") return "info";
  if (status === "finance-settled") return "positive";
  return "positive";
}

function qualityLabel(
  quality: InvestmentReconciliation["cashAsOfQuality"],
): string {
  if (quality === "confirmed-explicit-event") return "明確確認";
  if (quality === "inferred-from-balance-entry") return "舊資料推定";
  return "無法確認";
}

export function ReconciliationPage() {
  const { data, error, isLoading, mutate } =
    useApi<InvestmentReconciliation>(API_PATH);

  if (isLoading && !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "投資對帳中心" }}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={118} />
          ))}
        </div>
        <Skeleton height={190} />
        <Skeleton height={280} />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell navSections={stubNavSections} topbar={{ title: "投資對帳中心" }}>
        <ErrorState
          message={error?.message ?? "無法載入投資對帳資料"}
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  const activeSettlements = data.pendingSettlements.filter(
    (settlement) =>
      settlement.status !== "covered-by-cash-snapshot" &&
      settlement.status !== "finance-settled",
  );
  const overallVariant: StatusVariant =
    data.status === "reconciled"
      ? "positive"
      : data.status === "attention"
        ? "warning"
        : "negative";

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: "投資對帳中心",
        subtitle: `估值日 ${data.valuationDate} · 交割戶、未交割交易與持股市值的單一核對頁`,
      }}
      financeLastSync={data.cashAsOfDate}
      warningCount={data.warnings.length}
      warningLabel="對帳警示"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-dashboard-text">
            投資對帳中心
          </h1>
          <p className="mt-1 text-[12px] text-dashboard-faint">
            先核對現金來源，再加入尚未反映於銀行餘額的交割款。
          </p>
        </div>
        <StatusBadge
          variant={overallVariant}
          label={data.status === "reconciled" ? "已對帳" : "需要注意"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          label="已確認現金"
          value={formatTWD(data.confirmedCash)}
          hint={`截至 ${data.cashAsOfDate}`}
        />
        <MetricCard
          label="未交割調整"
          value={signedTwd(data.pendingTradeCashAdjustment)}
          trend={data.pendingTradeCashAdjustment >= 0 ? "up" : "down"}
        />
        <MetricCard label="有效現金" value={formatTWD(data.effectiveCashValue)} />
        <MetricCard
          label="持股市值"
          value={formatTWD(data.holdingsMarketValue)}
        />
        <MetricCard
          label="策略總價值"
          value={formatTWD(data.strategyValue)}
          trend={data.status === "reconciled" ? "up" : "neutral"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <Card header={<h2 className="text-[15px] font-semibold">現金對帳公式</h2>}>
          <div className="grid items-center gap-3 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <BridgeValue label="已確認現金" value={data.confirmedCash.toLocaleString("en-US")} />
            <span className="text-dashboard-faint" aria-hidden="true">+</span>
            <BridgeValue
              label="未交割調整"
              value={signedPlain(data.pendingTradeCashAdjustment)}
            />
            <span className="text-dashboard-faint" aria-hidden="true">=</span>
            <BridgeValue
              label="有效現金"
              value={data.effectiveCashValue.toLocaleString("en-US")}
              accent
            />
          </div>
          <div className="mt-4 border-t border-dashboard-border pt-4 text-center text-[12px] text-dashboard-muted">
            有效現金 {data.effectiveCashValue.toLocaleString("en-US")} ＋ 持股市值 {data.holdingsMarketValue.toLocaleString("en-US")} ＝ 策略總價值 {data.strategyValue.toLocaleString("en-US")}
          </div>
        </Card>

        <Card header={<h2 className="text-[15px] font-semibold">現金新鮮度</h2>}>
          <dl className="space-y-3 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dashboard-faint">確認日期</dt>
              <dd className="font-mono text-dashboard-text">{data.cashAsOfDate}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dashboard-faint">品質</dt>
              <dd>
                <StatusBadge
                  variant={
                    data.cashAsOfQuality === "confirmed-explicit-event"
                      ? "positive"
                      : "warning"
                  }
                  label={qualityLabel(data.cashAsOfQuality)}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-dashboard-faint">來源</dt>
              <dd className="max-w-[180px] truncate font-mono text-[11px] text-dashboard-muted">
                {data.cashAsOfSource ?? "unavailable"}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card
        header={
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">未交割交易</h2>
            <span className="text-[11px] text-dashboard-faint">
              {activeSettlements.length} 筆
            </span>
          </div>
        }
      >
        {activeSettlements.length === 0 ? (
          <EmptyState
            title="沒有未交割交易"
            description="目前已確認現金已涵蓋所有交易。"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-dashboard-border text-dashboard-faint">
                  <th className="px-3 py-2 font-medium">交易</th>
                  <th className="px-3 py-2 font-medium">方向</th>
                  <th className="px-3 py-2 font-medium">交易日</th>
                  <th className="px-3 py-2 font-medium">交割日</th>
                  <th className="px-3 py-2 text-right font-medium">現金調整</th>
                  <th className="px-3 py-2 font-medium">狀態</th>
                </tr>
              </thead>
              <tbody>
                {activeSettlements.map((settlement) => (
                  <tr key={settlement.id} className="border-b border-dashboard-border last:border-0">
                    <td className="px-3 py-3 font-mono text-dashboard-accent">
                      {settlement.symbol}
                    </td>
                    <td className="px-3 py-3 text-dashboard-muted">
                      {settlement.side === "sell" ? "賣出" : "買入"}
                    </td>
                    <td className="px-3 py-3 font-mono text-dashboard-muted">
                      {settlement.tradeDate}
                    </td>
                    <td className="px-3 py-3 font-mono text-dashboard-muted">
                      <div>{settlement.settlementDate ?? "待確認"}</div>
                      {settlement.settlementDateQuality ===
                        "inferred-twse-t-plus-2" && (
                        <div className="mt-0.5 text-[10px] font-sans text-dashboard-warn">
                          推定 T+2
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-dashboard-text">
                      {signedTwd(settlement.effectiveCashAdjustment)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        variant={statusVariant(settlement.status)}
                        label={statusLabel(settlement.status)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.warnings.length > 0 && (
        <Card header={<h2 className="text-[15px] font-semibold">對帳警示</h2>}>
          <ul className="space-y-2 text-[12px] text-dashboard-warn">
            {data.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}

function BridgeValue({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-ds-md bg-dashboard-chip px-4 py-3">
      <div className="text-[11px] text-dashboard-faint">{label}</div>
      <div
        className={`mt-1 font-mono text-[17px] font-semibold ${accent ? "text-dashboard-accent" : "text-dashboard-text"}`}
      >
        {value}
      </div>
    </div>
  );
}
