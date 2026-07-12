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
import type {
  AccountInfo,
  InsurancePolicyInfo,
  LoanInfo,
} from "@/lib/schemas/finance";

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

function InsurancePolicyCard({ policy }: { policy: InsurancePolicyInfo }) {
  const semiannualInterest = (policy.loanPrincipal * policy.loanRate) / 2;
  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">{policy.name}</h2>
            <p className="mt-0.5 text-[11px] text-dashboard-faint">
              {policy.policyType} · 估值日 {policy.valuationDate}
            </p>
          </div>
          <Chip variant="accent">可隨時解約</Chip>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <PolicyMetric
          label="表定解約價值"
          value={formatTWD(policy.scheduledSurrenderValue)}
        />
        <PolicyMetric
          label="已扣除的借款本息"
          value={`−${formatTWD(policy.totalLoanDeduction)}`}
          tone="negative"
        />
        <PolicyMetric
          label="可解約淨值"
          value={formatTWD(policy.netSurrenderValue)}
          tone="positive"
        />
        <PolicyMetric
          label="借款成數"
          value={`${policy.ltv.toFixed(2)}%`}
          tone="warning"
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-dashboard-border pt-3 text-[12px] text-dashboard-muted md:grid-cols-3">
        <div>
          本金 {formatTWD(policy.loanPrincipal)} ＋ 已計利息{" "}
          {formatTWD(policy.accruedInterest)} ＋ 日計調整{" "}
          {formatTWD(policy.estimatedDailyAdjustment)}
        </div>
        <div>
          借款利率 {(policy.loanRate * 100).toFixed(2)}% · 預估半年利息{" "}
          {formatTWD(semiannualInterest)}
        </div>
        <div>
          下次利息日 {policy.nextInterestDue} · 解約金成長規則{" "}
          {(policy.surrenderGrowthRate * 100).toFixed(2)}%
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-dashboard-faint">
        未付利息超過一年才併入本金；借款本息已扣在可解約淨值中，不再納入總負債以避免重複計算。本頁估值狀態：
        {policy.valuationStatus}。
      </p>
    </Card>
  );
}

function PolicyMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative" | "warning" | "neutral";
}) {
  const color =
    tone === "positive"
      ? "text-dashboard-pos"
      : tone === "negative"
        ? "text-dashboard-neg"
        : tone === "warning"
          ? "text-dashboard-warn"
          : "text-dashboard-text";
  return (
    <div className="rounded-ds-sm bg-dashboard-chip/40 p-3">
      <div className="text-[10.5px] text-dashboard-faint">{label}</div>
      <div
        className={`mt-1 font-mono-dashboard text-[16px] font-semibold ${color}`}
      >
        {value}
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
  const insurancePolicy = data?.insurancePolicy;

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

        {/* Policy asset and loan */}
        {insurancePolicy && <InsurancePolicyCard policy={insurancePolicy} />}

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
