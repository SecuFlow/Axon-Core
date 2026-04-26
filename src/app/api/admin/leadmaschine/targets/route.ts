import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type TargetRow = {
  id: string;
  created_at: string;
  updated_at: string;
  industry: string;
  city: string;
  is_active: boolean;
  last_used_at: string | null;
  notes: string | null;
};

const SELECT_COLUMNS =
  "id, created_at, updated_at, industry, city, is_active, last_used_at, notes";

function isTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("42p01") ||
    (m.includes("relation") && m.includes("leadmaschine_targets"))
  );
}

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        "Leadmaschine-Targets-Tabelle fehlt. Bitte Supabase-Migration 20260424000000_leadmaschine_linkedin_ecosystem.sql ausführen.",
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const res = await ctx.service
    .from("leadmaschine_targets")
    .select(SELECT_COLUMNS)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (res.error) {
    if (isTableMissingError(res.error.message)) return tableMissingResponse();
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const targets = (res.data ?? []).map((r) => r as TargetRow);
  return NextResponse.json({ targets }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: { industry?: unknown; city?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!industry) {
    return NextResponse.json(
      { error: "Branche erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!city) {
    return NextResponse.json(
      { error: "Stadt erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const ins = await ctx.service
    .from("leadmaschine_targets")
    .insert({
      industry: industry.slice(0, 128),
      city: city.slice(0, 128),
      notes: notes ? notes.slice(0, 1024) : null,
      is_active: true,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (ins.error) {
    if (isTableMissingError(ins.error.message)) return tableMissingResponse();
    if (ins.error.message.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { error: "Diese Branche/Stadt-Kombination existiert bereits." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: ins.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, target: ins.data as TargetRow },
    { headers: NO_STORE_HEADERS },
  );
}
