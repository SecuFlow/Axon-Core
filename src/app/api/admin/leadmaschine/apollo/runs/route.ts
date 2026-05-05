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

  type RunRow = Record<string, unknown>;

  // Versuch 1: voller Spalten-Satz inkl. Phase-2 Counter
  const primary = await ctx.service
    .from("apollo_discovery_runs")
    .select(
      "id, started_at, finished_at, trigger, segment, target_count, searched_count, enriched_count, inserted_count, skipped_duplicate_count, skipped_no_email_count, skipped_generic_mailbox_count, skipped_authenticity_count, skipped_unqualified_count, qualification_summary, apollo_credits_used, error_message",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  let rows: RunRow[] | null = null;
  let lastError = primary.error;

  if (!primary.error) {
    rows = (primary.data ?? []) as unknown as RunRow[];
  } else {
    const m = primary.error.message.toLowerCase();
    // Fallback: ohne Phase-2 Counter (Migration noch nicht durch)
    if (m.includes("column") || m.includes("schema")) {
      const legacy = await ctx.service
        .from("apollo_discovery_runs")
        .select(
          "id, started_at, finished_at, trigger, segment, target_count, searched_count, enriched_count, inserted_count, skipped_duplicate_count, skipped_no_email_count, skipped_generic_mailbox_count, apollo_credits_used, error_message",
        )
        .order("started_at", { ascending: false })
        .limit(limit);
      if (!legacy.error) {
        rows = (legacy.data ?? []) as unknown as RunRow[];
        lastError = null;
      } else {
        lastError = legacy.error;
      }
    }
  }

  if (lastError) {
    const m = lastError.message.toLowerCase();
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
      { error: lastError.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { runs: rows ?? [] },
    { headers: NO_STORE_HEADERS },
  );
}
