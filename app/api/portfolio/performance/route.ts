import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toSafeResponse } from "@/lib/errors";
import { getDailySnapshots } from "@/lib/data/portfolio-repository";
import { computePerformanceChart } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

const RangeSchema = z.enum(["1M", "3M", "6M", "YTD", "1Y", "ALL"]);

const QuerySchema = z.object({
  range: RangeSchema.optional().default("1Y"),
});

/**
 * GET /api/portfolio/performance?range=1Y
 *
 * Returns performance time-series: portfolio index (base 100),
 * benchmark index, date labels, and raw market values.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    const parsed = QuerySchema.safeParse({
      range: searchParams.get("range") ?? "1Y",
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          version: 1,
          error: {
            message: "Invalid query parameters",
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

    const since = rangeToSince(parsed.data.range);
    const snapshotsResult = getDailySnapshots(since);

    const snapshots = snapshotsResult.ok ? snapshotsResult.value : [];
    const chart = computePerformanceChart(snapshots);

    return NextResponse.json(
      { version: 1, data: chart },
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
// Helper
// ---------------------------------------------------------------------------

function rangeToSince(range: z.infer<typeof RangeSchema>): string {
  const now = new Date();
  switch (range) {
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "3M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().slice(0, 10);
    }
    case "6M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    }
    case "YTD": {
      return `${now.getFullYear()}-01-01`;
    }
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "ALL":
    default:
      return "2000-01-01";
  }
}
