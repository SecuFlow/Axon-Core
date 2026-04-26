import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { generateLeadResearch, upsertLeadResearchNotes } from "@/lib/leadResearchGenerator.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanSegment(raw: string | null): "enterprise" | "smb" | null {
  if (raw === "enterprise" || raw === "smb") return raw;
  return null;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const seg = cleanSegment(req.nextUrl.searchParams.get("segment"));
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(25, Number(limitRaw ?? "10") || 10));
  const force = req.nextUrl.searchParams.get("force") === "1";
  const cooldownSince = daysAgoIso(7);

  // Leads ohne Research Notes priorisieren: neueste zuerst (damit UI-Flow schnell „gefüllt“ wird)
  let q = ctx.service
    .from("leads")
    .select("id, created_at, lead_segment")
    .order("created_at", { ascending: false })
    .limit(200);

  if (seg) q = q.eq("lead_segment", seg);

  const leadsRes = await q;
  if (leadsRes.error) {
    return NextResponse.json(
      { error: leadsRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const leadIds = (leadsRes.data ?? [])
    .map((r) => (r as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string");

  if (leadIds.length === 0) {
    return NextResponse.json({ ok: true, executed: 0, skipped: 0 }, { headers: NO_STORE_HEADERS });
  }

  // Filter: keine Notes vorhanden (oder älter als Cooldown, wenn nicht force)
  const notesRes = await ctx.service
    .from("lead_research_notes")
    .select("lead_id, updated_at")
    .in("lead_id", leadIds)
    .limit(500);

  if (notesRes.error) {
    if (notesRes.error.message.includes("lead_research_notes")) {
      return NextResponse.json(
        { error: "Research-Layer ist noch nicht migriert. Bitte Supabase-Migration ausführen." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: notesRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const freshness = new Map<string, string | null>();
  for (const r of notesRes.data ?? []) {
    const row = r as { lead_id?: unknown; updated_at?: unknown };
    const id = row?.lead_id;
    if (typeof id !== "string") continue;
    const updated_at = row?.updated_at;
    freshness.set(id, typeof updated_at === "string" ? updated_at : null);
  }

  const todo = leadIds
    .filter((id) => {
      const updated_at = freshness.get(id);
      if (!updated_at) return true; // keine Notes
      if (force) return true;
      // Cooldown: nur wenn älter als 7 Tage
      return updated_at < cooldownSince;
    })
    .slice(0, limit);
  const eligible = todo.length;
  let executed = 0;
  const errors: Array<{ lead_id: string; error: string }> = [];

  for (const id of todo) {
    const gen = await generateLeadResearch({ service: ctx.service, leadId: id });
    if (!gen.ok) {
      errors.push({ lead_id: id, error: gen.error });
      continue;
    }
    const up = await upsertLeadResearchNotes({ service: ctx.service, leadId: id, generated: gen.research });
    if (!up.ok) {
      errors.push({ lead_id: id, error: up.error });
      continue;
    }
    executed++;
  }

  return NextResponse.json(
    {
      ok: true,
      executed,
      eligible,
      skipped: Math.max(0, eligible - executed),
      errors,
    },
    { headers: NO_STORE_HEADERS },
  );
}

