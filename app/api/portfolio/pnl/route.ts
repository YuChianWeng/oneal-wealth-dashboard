import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { computePnlAnalytics } from "@/lib/analytics/pnl";
import {
  auditPortfolioFeeTaxAccounting,
  type FeeTaxAuditTrade,
} from "@/lib/data/portfolio-calculations";
import {
  listAllTrades,
  listOpenPositions,
} from "@/lib/data/portfolio-repository";

/** GET /api/portfolio/pnl — source-backed PnL and fee/tax audit data. */
export function GET(): NextResponse {
  try {
    const positionsResult = listOpenPositions();
    if (!positionsResult.ok) throw positionsResult.error;

    const tradesResult = listAllTrades();
    if (!tradesResult.ok) throw tradesResult.error;

    const trades = tradesResult.value;
    const analytics = computePnlAnalytics({
      trades,
      positions: positionsResult.value,
    });
    const auditInput: FeeTaxAuditTrade[] = trades.map((trade) => ({
      side: trade.side,
      grossAmount: trade.grossAmount,
      feeTax: trade.feeTax,
      netCashflow: trade.netCashflow,
      realizedPnl: trade.realizedPnl,
      realizedPnlIncludesFeeTax: trade.realizedPnlIncludesFeeTax,
      dataQuality: trade.dataQuality,
    }));
    const audit = auditPortfolioFeeTaxAccounting(auditInput);

    return NextResponse.json(
      {
        version: 1,
        data: {
          ...analytics,
          feeTaxAudit: {
            status: audit.status,
            trades: audit.trades.map((result, index) => ({
              id: trades[index]?.id ?? `audit-${index}`,
              symbol: trades[index]?.symbol ?? "—",
              date: trades[index]?.date ?? null,
              side: trades[index]?.side ?? null,
              ...result,
            })),
          },
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { version: 1, error: toSafeResponse(error) },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
