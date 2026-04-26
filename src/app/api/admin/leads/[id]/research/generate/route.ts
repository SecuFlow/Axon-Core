import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { generateLeadResearch, upsertLeadResearchNotes } from "@/lib/leadResearchGenerator.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function POST(
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

  const gen = await generateLeadResearch({ service: ctx.service, leadId });
  if (!gen.ok) {
    // Best effort: Persistiere eine klare Warnung statt "stiller Leere".
    const up = await upsertLeadResearchNotes({
      service: ctx.service,
      leadId,
      generated: {
        summary: null,
        pain_points: null,
        personalization_hooks: null,
        confidence: 0,
        raw_notes:
          `[WARNUNG · Research nicht verfügbar]\n` +
          `${gen.error}\n` +
          `Bitte später erneut versuchen oder Quellen manuell ergänzen.\n`,
        sources: [],
        model: null,
      },
    });
    if (up.ok) {
      return NextResponse.json(
        { error: gen.error, stored_warning: true, research: up.row ?? null },
        { status: gen.status ?? 502, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: gen.error }, { status: gen.status ?? 500, headers: NO_STORE_HEADERS });
  }

  const up = await upsertLeadResearchNotes({
    service: ctx.service,
    leadId,
    generated: gen.research,
  });
  if (!up.ok) {
    return NextResponse.json({ error: up.error }, { status: up.status ?? 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(
    { ok: true, research: up.row ?? null, model: gen.research.model },
    { headers: NO_STORE_HEADERS },
  );
}

