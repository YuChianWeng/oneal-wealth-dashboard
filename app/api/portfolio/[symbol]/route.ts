import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toSafeResponse } from "@/lib/errors";
import { getPosition, getTrades } from "@/lib/data/portfolio-repository";
import { getResearchSummary } from "@/lib/data/research-repository";

// ---------------------------------------------------------------------------
// Param validation
// ---------------------------------------------------------------------------

const ParamsSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9.]+$/, "Invalid symbol format"),
});

/**
 * GET /api/portfolio/[symbol]
 *
 * Returns a single stock's detail: position + trades + research thesis.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
): Promise<NextResponse> {
  try {
    const raw = await params;

    const parsed = ParamsSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          version: 1,
          error: {
            message: "Invalid symbol parameter",
            code: "VALIDATION_ERROR",
            details: parsed.error.flatten().fieldErrors,
          },
        },
        {
          status: 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const { symbol } = parsed.data;

    // Fetch position, trades, and research in parallel (best-effort)
    const positionResult = getPosition(symbol);
    const tradesResult = getTrades(symbol);
    const researchResult = getResearchSummary(symbol);

    // Position is required — return 404 if not found
    if (!positionResult.ok) {
      const safe = toSafeResponse(positionResult.error);
      const status =
        positionResult.error.code === "VAULT_POSITION_NOT_FOUND" ? 404 : 500;
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    // Trades are part of the portfolio economics contract. Do not turn a
    // source or parsing failure into an apparently valid empty trade history.
    if (!tradesResult.ok) {
      const safe = toSafeResponse(tradesResult.error);
      return NextResponse.json(
        { version: 1, error: safe },
        {
          status: 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    const position = positionResult.value;
    const trades = tradesResult.value;
    const research = researchResult.ok ? researchResult.value : null;

    return NextResponse.json(
      {
        version: 1,
        data: {
          position,
          trades,
          research,
        },
      },
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
