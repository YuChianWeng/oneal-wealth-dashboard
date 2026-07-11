import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import {
  balanceSnapshots,
  monthlySummary,
  accountsList as repoAccountsList,
} from "@/lib/data/finance-repository";
import { listOpenPositions } from "@/lib/data/portfolio-repository";
import { computeNetWorth } from "@/lib/analytics/net-worth";
import {
  emergencyFundMonths,
  savingsRate,
  debtRatio,
  concentrationRisk,
} from "@/lib/analytics/financial-health";
import type { NetWorthSeries } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GrowthResponse {
  netWorth: NetWorthSeries | null;
  financialHealth: {
    emergencyFundMonths: number | null;
    savingsRate: number | null;
    debtRatio: number | null;
    concentration: {
      maxStock: string;
      maxName: string;
      maxWeight: number;
    } | null;
  };
  milestones: Milestone[];
}

export interface Milestone {
  date: string;
  label: string;
  value: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * GET /api/growth
 *
 * Returns net-worth time series, financial health metrics, and
 * milestone data for the growth dashboard page.
 */
export async function GET(): Promise<NextResponse> {
  try {
    // ── Gather data (best-effort) ───────────────────────────────────

    // Balance snapshots for net worth (all active accounts)
    const accountsResult = repoAccountsList();
    const accounts = accountsResult.ok ? accountsResult.value : [];

    // Aggregate net worth across all accounts
    // For simplicity, sum up balance snapshots for the last 12 months
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const since = twelveMonthsAgo.toISOString().slice(0, 10);

    // Get snapshots for all accounts and aggregate by date
    const dateMap = new Map<string, { assets: number; liabilities: number }>();

    let coveredAccounts = 0;

    for (const account of accounts) {
      try {
        // Try to get balance snapshots for this account
        const snapshotsResult = balanceSnapshots(account.name, since);
        if (!snapshotsResult.ok) continue;

        const snapshots = snapshotsResult.value;
        if (snapshots.length === 0) continue;
        coveredAccounts++;

        for (const snap of snapshots) {
          const existing = dateMap.get(snap.date);
          if (existing) {
            existing.assets += snap.totalAssets;
            existing.liabilities += snap.totalLiabilities;
          } else {
            dateMap.set(snap.date, {
              assets: snap.totalAssets,
              liabilities: snap.totalLiabilities,
            });
          }
        }
      } catch {
        // Skip accounts with errors
      }
    }

    // Convert to BalanceSnapshot array for computeNetWorth
    const balanceSnapshotsArray = Array.from(dateMap.entries())
      .map(([date, { assets, liabilities }]) => ({
        date,
        totalAssets: assets,
        totalLiabilities: liabilities,
        netWorth: assets - liabilities,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalAccounts = accounts.length;
    const netWorth = computeNetWorth(
      balanceSnapshotsArray,
      totalAccounts,
      coveredAccounts,
    );

    // ── Financial health metrics ─────────────────────────────────────

    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const summaryResult = monthlySummary(currentMonth);
    const summary = summaryResult.ok ? summaryResult.value : null;

    // Monthly expense for emergency fund calculation
    const monthlyExpense = summary?.totalExpense ?? null;

    // Total liquid assets (non-investment, non-debt accounts)
    let liquidAssets = 0;
    let totalAssets = 0;
    let totalLiabilities = 0;
    for (const account of accounts) {
      const balance = (account as { balance: number }).balance ?? 0;
      if (balance > 0) {
        totalAssets += balance;
        // Consider non-debt, non-investment accounts as liquid
        const type = (account as { type: string }).type ?? "";
        if (type !== "investment" && type !== "debt" && type !== "loan") {
          liquidAssets += balance;
        }
      }
      if (balance < 0) {
        totalLiabilities += Math.abs(balance);
      }
    }

    const efMonths = emergencyFundMonths(monthlyExpense, liquidAssets);
    const sRate = summary
      ? savingsRate(summary.totalIncome, summary.totalExpense)
      : null;
    const dRatio = debtRatio(totalLiabilities, totalAssets);

    // Concentration risk
    const positionsResult = listOpenPositions();
    const positions = positionsResult.ok ? positionsResult.value : [];
    const concentration = concentrationRisk(positions);

    // ── Milestones ───────────────────────────────────────────────────

    const milestones = buildMilestones(netWorth);

    // ── Response ─────────────────────────────────────────────────────

    const data: GrowthResponse = {
      netWorth,
      financialHealth: {
        emergencyFundMonths: efMonths,
        savingsRate: sRate,
        debtRatio: dRatio,
        concentration: concentration
          ? {
              maxStock: concentration.maxStock,
              maxName: concentration.maxName,
              maxWeight: concentration.maxWeight,
            }
          : null,
      },
      milestones,
    };

    return NextResponse.json(
      { version: 1, data },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (err) {
    const safe = toSafeResponse(err);
    return NextResponse.json(
      { version: 1, error: safe },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Milestone builder
// ---------------------------------------------------------------------------

const MILESTONE_LABELS = [
  { threshold: 0, label: "起始點", description: "開始記錄淨資產" },
  { threshold: 500000, label: "NT$50 萬", description: "淨資產突破 50 萬" },
  { threshold: 1000000, label: "NT$100 萬", description: "淨資產突破 100 萬" },
  { threshold: 2000000, label: "NT$200 萬", description: "淨資產突破 200 萬" },
  { threshold: 3000000, label: "NT$300 萬", description: "淨資產突破 300 萬" },
  { threshold: 5000000, label: "NT$500 萬", description: "淨資產突破 500 萬" },
  {
    threshold: 10000000,
    label: "NT$1,000 萬",
    description: "淨資產突破 1,000 萬",
  },
];

function buildMilestones(netWorth: NetWorthSeries | null): Milestone[] {
  if (!netWorth || netWorth.points.length === 0) return [];

  const milestones: Milestone[] = [];
  let lastTriggered: number | null = null;

  for (const point of netWorth.points) {
    for (const m of MILESTONE_LABELS) {
      if (lastTriggered !== null && m.threshold <= lastTriggered) continue;
      if (point.netWorth >= m.threshold && m.threshold > 0) {
        milestones.push({
          date: point.date,
          label: m.label,
          value: point.netWorth,
          description: m.description,
        });
        lastTriggered = m.threshold;
      }
    }
  }

  // Add starting point as first milestone if we have data
  const first = netWorth.points[0];
  if (first.netWorth > 0 && !milestones.some((m) => m.label === "起始點")) {
    milestones.unshift({
      date: first.date,
      label: "起始點",
      value: first.netWorth,
      description: "開始記錄淨資產",
    });
  }

  // Sort by date
  milestones.sort((a, b) => a.date.localeCompare(b.date));

  return milestones;
}
