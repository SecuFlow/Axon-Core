import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanText(v: unknown, max = 12_000): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function cleanConfidence(v: unknown): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(v)
        : NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanSources(v: unknown): unknown {
  if (Array.isArray(v)) return v.slice(0, 50);
  return [];
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const leadId = (id ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "Lead-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const res = await ctx.service
    .from("lead_research_notes")
    .select("lead_id, summary, pain_points, personalization_hooks, sources, confidence, raw_notes, updated_at")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (res.error) {
    if (res.error.message.includes("lead_research_notes")) {
      return NextResponse.json({ research: null }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: res.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ research: res.data ?? null }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const leadId = (id ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "Lead-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const summary = cleanText(b.summary, 4000);
  const pain_points = cleanText(b.pain_points, 8000);
  const personalization_hooks = cleanText(b.personalization_hooks, 8000);
  const raw_notes = cleanText(b.raw_notes, 12_000);
  const sources = cleanSources(b.sources);
  const confidence = cleanConfidence(b.confidence);

  const up = await ctx.service
    .from("lead_research_notes")
    .upsert(
      {
        lead_id: leadId,
        summary,
        pain_points,
        personalization_hooks,
        raw_notes,
        sources,
        confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lead_id" },
    )
    .select("lead_id, summary, pain_points, personalization_hooks, sources, confidence, raw_notes, updated_at")
    .single();

  if (up.error) {
    if (up.error.message.includes("lead_research_notes")) {
      return NextResponse.json(
        { error: "Research-Layer ist noch nicht migriert. Bitte Supabase-Migration ausführen." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: up.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true, research: up.data ?? null }, { headers: NO_STORE_HEADERS });
}

