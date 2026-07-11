import "server-only";

import { NextResponse } from "next/server";
import { toSafeResponse } from "@/lib/errors";
import { getDb } from "@/lib/data/finance-db";
import { getAccountsList } from "@/lib/data/finance-queries";
import { listNotes } from "@/lib/data/vault-reader";
import { config } from "@/lib/config";
import { existsSync, statSync } from "node:fs";
import type { SourceHealth, HealthStatus } from "@/lib/source-health";
import { aggregateHealth } from "@/lib/source-health";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataStatusResponse {
  sources: SourceHealth[];
  overallStatus: HealthStatus;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * GET /api/data-status
 *
 * Returns per-source health diagnostics: freshness timestamps,
 * record counts, warning counts, and an overall system health status.
 * No file paths or raw errors are exposed.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const sources: SourceHealth[] = [];

    // ── Finance DB source ────────────────────────────────────────────
    const dbPath = config.financeDbPath;
    let financeModTime: string | null = null;
    let financeRecordCount = 0;
    let financeWarningCount = 0;
    let financeErrorCode: string | undefined;

    try {
      if (existsSync(dbPath)) {
        const stats = statSync(dbPath);
        financeModTime = stats.mtime.toISOString();

        const db = getDb();

        // Count total transactions
        try {
          const countRow = db
            .prepare("SELECT COUNT(*) AS cnt FROM transactions")
            .get() as { cnt: number } | undefined;
          financeRecordCount = countRow?.cnt ?? 0;
        } catch {
          financeRecordCount = 0;
        }

        // Count warnings: transactions with empty/incomplete notes or missing categories
        try {
          const warnRow = db
            .prepare(
              `SELECT COUNT(*) AS cnt FROM transactions
               WHERE (note IS NULL OR note = '')
                  OR (category_key IS NULL OR category_key = '')`,
            )
            .get() as { cnt: number } | undefined;
          financeWarningCount = warnRow?.cnt ?? 0;
        } catch {
          financeWarningCount = 0;
        }
      } else {
        financeErrorCode = "DB_FILE_NOT_FOUND";
      }
    } catch (e) {
      financeErrorCode = "DB_READ_ERROR";
    }

    sources.push({
      sourceName: "finance-db",
      lastModifiedAt: financeModTime,
      lastSuccessfulReadAt: financeModTime, // same as modTime since we just read it
      recordCount: financeRecordCount,
      warningCount: financeWarningCount,
      errorCode: financeErrorCode,
    });

    // ── Obsidian vault source ────────────────────────────────────────
    const vaultPath = config.obsidianVaultPath;
    let vaultModTime: string | null = null;
    let vaultRecordCount = 0;
    let vaultWarningCount = 0;
    let vaultErrorCode: string | undefined;

    try {
      if (existsSync(vaultPath)) {
        // Count files across whitelisted directories
        const dirs = [
          "Trading/Portfolio/Positions",
          "Trading/Portfolio/Transactions",
          "Trading/Portfolio/Snapshots",
          "Trading/Stocks",
        ];

        let latestMtime = 0;
        for (const dir of dirs) {
          try {
            const files = listNotes(dir);
            if (files.ok) {
              for (const f of files.value) {
                vaultRecordCount++;
                try {
                  const fullPath = `${vaultPath}/${f}`;
                  if (existsSync(fullPath)) {
                    const s = statSync(fullPath);
                    if (s.mtimeMs > latestMtime) {
                      latestMtime = s.mtimeMs;
                    }
                  }
                } catch {
                  // Skip per-file stat errors
                }
              }
            } else {
              vaultWarningCount++;
            }
          } catch {
            vaultWarningCount++;
          }
        }

        if (latestMtime > 0) {
          vaultModTime = new Date(latestMtime).toISOString();
        }
      } else {
        vaultErrorCode = "VAULT_PATH_NOT_FOUND";
      }
    } catch (e) {
      vaultErrorCode = "VAULT_READ_ERROR";
    }

    sources.push({
      sourceName: "obsidian-vault",
      lastModifiedAt: vaultModTime,
      lastSuccessfulReadAt: vaultModTime,
      recordCount: vaultRecordCount,
      warningCount: vaultWarningCount,
      errorCode: vaultErrorCode,
    });

    // ── Aggregate health ─────────────────────────────────────────────

    const overallStatus = aggregateHealth(sources);

    const data: DataStatusResponse = {
      sources,
      overallStatus,
      generatedAt: new Date().toISOString(),
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
