import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { buildMatrixDorkQuery, buildMatrixGoogleUrl } from "@/lib/matrixRiss";
import { LEAD_DAILY_HARD_CAP } from "@/lib/leadmaschineTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type TargetRow = {
  id: string;
  industry: string;
  city: string;
  last_used_at: string | null;
};

type MatrixCard = {
  target_id: string;
  industry: string;
  city: string;
  query: string;
  google_url: string;
};

function isTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("42p01");
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const company = (request.nextUrl.searchParams.get("company") ?? "").trim();
  const touch = request.nextUrl.searchParams.get("touch") === "true";

  // Round-Robin: aelteste last_used_at zuerst (NULL = hoechste Prio).
  const res = await ctx.service
    .from("leadmaschine_targets")
    .select("id, industry, city, last_used_at")
    .eq("is_active", true)
    .order("last_used_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(LEAD_DAILY_HARD_CAP);

  if (res.error) {
    if (isTableMissingError(res.error.message)) {
      return NextResponse.json(
        {
          cards: [],
          daily_cap: LEAD_DAILY_HARD_CAP,
          warning:
            "Targets-Tabelle fehlt. Bitte Migration 20260424000000_leadmaschine_linkedin_ecosystem.sql ausführen.",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const rows = (res.data ?? []).map((r) => r as TargetRow);
  const cards: MatrixCard[] = rows.map((r) => ({
    target_id: r.id,
    industry: r.industry,
    city: r.city,
    query: buildMatrixDorkQuery({ city: r.city, company }),
    google_url: buildMatrixGoogleUrl({ city: r.city, company }),
  }));

  // Beim "touch" aktualisieren wir last_used_at - das bucht die Targets
  // in die Round-Robin-Rotation ein. Nur auf explizite Anforderung, damit
  // Polling im UI nicht staendig die Prioritaet verschiebt.
  if (touch && rows.length > 0) {
    const now = new Date().toISOString();
    const ids = rows.map((r) => r.id);
    await ctx.service
      .from("leadmaschine_targets")
      .update({ last_used_at: now, updated_at: now })
      .in("id", ids);
  }

  return NextResponse.json(
    { cards, daily_cap: LEAD_DAILY_HARD_CAP },
    { headers: NO_STORE_HEADERS },
  );
}
