import "server-only";

import { NextResponse } from "next/server";
import { investmentReconciliation } from "@/lib/data/reconciliation-repository";
import { toSafeResponse } from "@/lib/errors";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

/** GET /api/portfolio/reconciliation — auditable investment cash reconciliation. */
export async function GET(): Promise<NextResponse> {
  try {
    const result = investmentReconciliation();
    if (!result.ok) throw result.error;

    return NextResponse.json(
      { version: 1, data: result.value },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { version: 1, error: toSafeResponse(error) },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
