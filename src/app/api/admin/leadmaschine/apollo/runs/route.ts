import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

/**
 * GET /api/admin/leadmaschine/apollo/runs?limit=20
 * Listet die letzten Apollo-Discovery-Runs.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(100, Number(limitRaw ?? "20") || 20));

  const res = await ctx.service
    .from("apollo_discovery_runs")
    .select(
      "id, started_at, finished_at, trigger, segment, target_count, searched_count, enriched_count, inserted_count, skipped_duplicate_count, skipped_no_email_count, skipped_generic_mailbox_count, apollo_credits_used, error_message",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (res.error) {
    const m = res.error.message.toLowerCase();
    if (m.includes("does not exist") || m.includes("42p01")) {
      return NextResponse.json(
        {
          error:
            "apollo_discovery_runs-Tabelle fehlt. Migration 20260505180000_leadmaschine_apollo_pivot.sql ausführen.",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { runs: res.data ?? [] },
    { headers: NO_STORE_HEADERS },
  );
}
