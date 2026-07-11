"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/ui/chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { stubNavSections } from "@/lib/nav-sections";
import { formatTWD } from "@/lib/format";
import { useAccounts } from "@/lib/hooks/use-finance";
import type { AccountInfo, LoanInfo } from "@/lib/schemas/finance";

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-[22px]">
      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={100} />
        ))}
      </div>
      <Skeleton height={180} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function accountTypeVariant(
  type: string,
): "positive" | "negative" | "warning" | "info" | "neutral" {
  const t = type.toLowerCase();
  if (t === "checking" || t === "savings") return "positive";
  if (t === "credit" || t === "credit_card") return "warning";
  if (t === "loan" || t === "debt") return "negative";
  if (t === "investment" || t === "brokerage") return "info";
  return "neutral";
}

function accountTypeLabel(type: string): string {
  const t = type.toLowerCase();
  if (t === "checking") return "活存";
  if (t === "savings") return "定存";
  if (t === "credit" || t === "credit_card") return "信用卡";
  if (t === "loan") return "貸款";
  if (t === "investment" || t === "brokerage") return "投資";
  return type;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccountCard({ account }: { account: AccountInfo }) {
  const isDebt = account.balance < 0;
  const absBalance = Math.abs(account.balance);

  return (
    <Card className="flex flex-col gap-[10px]" style={{ padding: "16px" }}>
      <div className="flex items-center justify-between">
        <span className="text-[13.5px] font-medium text-dashboard-text">
          {account.name}
        </span>
        <StatusBadge
          variant={accountTypeVariant(account.type)}
          label={accountTypeLabel(account.type)}
        />
      </div>
      <div className="flex items-baseline gap-[6px]">
        <span
          className={`font-mono-dashboard text-[22px] font-semibold ${
            isDebt ? "text-dashboard-neg" : "text-dashboard-pos"
          }`}
        >
          {isDebt ? "\u2212" : ""}
          {formatTWD(absBalance)}
        </span>
      </div>
    </Card>
  );
}

function LoanCard({ loan }: { loan: LoanInfo }) {
  const progressPct =
    loan.principal > 0
      ? Math.round((1 - loan.remainingBalance / loan.principal) * 100)
      : 0;

  return (
    <div className="rounded-ds-sm border border-dashboard-border bg-dashboard-surface-2 p-[14px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-dashboard-text">
          {loan.name}
        </span>
        <Chip variant="warn">{progressPct}% 已還</Chip>
      </div>
      <div className="mt-[10px] grid grid-cols-3 gap-[10px]">
        <div>
          <div className="text-[10.5px] text-dashboard-faint">原始本金</div>
          <div className="font-mono-dashboard text-[13px] font-medium text-dashboard-muted">
            {formatTWD(loan.principal)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] text-dashboard-faint">剩餘本金</div>
          <div className="font-mono-dashboard text-[13px] font-medium text-dashboard-neg">
            {formatTWD(loan.remainingBalance)}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] text-dashboard-faint">月利息</div>
          <div className="font-mono-dashboard text-[13px] font-medium text-dashboard-warn">
            {formatTWD(loan.interest)}
          </div>
        </div>
      </div>
      <div className="mt-[10px] h-[6px] w-full overflow-hidden rounded-full bg-dashboard-chip">
        <div
          className="h-full rounded-full bg-dashboard-pos transition-all"
          style={{ width: `${Math.min(progressPct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AccountsPage() {
  const { data, error, isLoading, isValidating, mutate } = useAccounts();

  if (isLoading) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "帳戶與負債", subtitle: "載入中…" }}
      >
        <AccountsSkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "帳戶與負債", subtitle: "資料載入失敗" }}
      >
        <ErrorState
          message="無法載入帳戶資料，請檢查資料來源或稍後再試。"
          onRetry={() => mutate()}
        />
      </AppShell>
    );
  }

  const accounts = data?.accounts ?? [];
  const loans = data?.loans ?? [];

  if (accounts.length === 0 && loans.length === 0) {
    return (
      <AppShell
        navSections={stubNavSections}
        topbar={{ title: "帳戶與負債", subtitle: "尚無資料" }}
      >
        <EmptyState
          title="尚無帳戶資料"
          description="目前沒有任何已連結的帳戶或貸款記錄。"
        />
      </AppShell>
    );
  }

  const totalAssets = accounts
    .filter((a) => a.balance > 0)
    .reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = accounts
    .filter((a) => a.balance < 0)
    .reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const loanPrincipal = loans.reduce((sum, l) => sum + l.remainingBalance, 0);

  return (
    <AppShell
      navSections={stubNavSections}
      topbar={{
        title: "帳戶與負債",
        subtitle: isValidating
          ? "更新中…"
          : `${accounts.length} 個帳戶 · ${loans.length} 筆貸款`,
      }}
    >
      <div className="flex flex-col gap-[22px]">
        {/* Summary totals */}
        <div className="flex flex-wrap gap-[14px]">
          <div className="flex-1 rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[16px]">
            <div className="text-[11.5px] text-dashboard-faint">總資產</div>
            <div className="mt-[4px] font-mono-dashboard text-[20px] font-semibold text-dashboard-pos">
              {formatTWD(totalAssets)}
            </div>
          </div>
          <div className="flex-1 rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[16px]">
            <div className="text-[11.5px] text-dashboard-faint">
              負債 (帳戶透支)
            </div>
            <div className="mt-[4px] font-mono-dashboard text-[20px] font-semibold text-dashboard-neg">
              {formatTWD(totalLiabilities)}
            </div>
          </div>
          <div className="flex-1 rounded-ds-lg border border-dashboard-border bg-dashboard-surface p-[16px]">
            <div className="text-[11.5px] text-dashboard-faint">
              貸款剩餘本金
            </div>
            <div className="mt-[4px] font-mono-dashboard text-[20px] font-semibold text-dashboard-warn">
              {formatTWD(loanPrincipal)}
            </div>
          </div>
        </div>

        {/* Account grid */}
        <Card
          header={
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-semibold">帳戶餘額</span>
              <Chip variant="default">{accounts.length} 個帳戶</Chip>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acct) => (
              <AccountCard key={acct.name} account={acct} />
            ))}
          </div>
        </Card>

        {/* Loan section */}
        {loans.length > 0 && (
          <Card
            header={
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-semibold">貸款明細</span>
                <Chip variant="warn">{loans.length} 筆貸款</Chip>
              </div>
            }
          >
            <div className="flex flex-col gap-[14px]">
              {loans.map((loan) => (
                <LoanCard key={loan.name} loan={loan} />
              ))}
            </div>
          </Card>
        )}

        {isValidating && (
          <div className="text-center text-[11px] text-dashboard-faint">
            正在更新資料…
          </div>
        )}
      </div>
    </AppShell>
  );
}
