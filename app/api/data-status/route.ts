import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import type { SourceHealth } from "@/lib/source-health";

/**
 * GET /api/data-status
 *
 * Returns source-freshness information for each data source.
 * No file paths or raw errors are exposed — only safe timestamps
 * and record counts.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sources: SourceHealth[] = [
      {
        sourceName: "finance-db",
        lastModifiedAt: null,
        lastSuccessfulReadAt: null,
        recordCount: 0,
        warningCount: 0,
      },
      {
        sourceName: "obsidian-vault",
        lastModifiedAt: null,
        lastSuccessfulReadAt: null,
        recordCount: 0,
        warningCount: 0,
      },
    ];

    // TODO: integrate with actual source health checks from
    // lib/data/finance-db.ts and lib/data/vault-reader.ts
    // For now, return placeholder data.

    return NextResponse.json(
      { version: 1, data: sources },
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
