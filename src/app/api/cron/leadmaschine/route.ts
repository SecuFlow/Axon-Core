import { NextResponse } from "next/server";
import { createServiceClientFromEnv, runLeadmaschine } from "@/lib/leadmaschineRunner.server";
import { generateLeadResearch, upsertLeadResearchNotes } from "@/lib/leadResearchGenerator.server";
import { verifyCronAuth } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function handle(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = await createServiceClientFromEnv();

  // Optional: Research Backfill (klein, damit Cron stabil bleibt)
  try {
    const cooldownSince = daysAgoIso(7);
    const leadsRes = await service
      .from("leads")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    if (!leadsRes.error) {
      const leadIds = (leadsRes.data ?? [])
        .map((r) => (r as { id?: unknown })?.id)
        .filter((x): x is string => typeof x === "string");
      if (leadIds.length > 0) {
        const notesRes = await service
          .from("lead_research_notes")
          .select("lead_id, updated_at")
          .in("lead_id", leadIds)
          .limit(200);

        const freshness = new Map<string, string | null>();
        if (!notesRes.error) {
          for (const r of notesRes.data ?? []) {
            const row = r as { lead_id?: unknown; updated_at?: unknown };
            const id = row?.lead_id;
            if (typeof id !== "string") continue;
            const updated_at = row?.updated_at;
            freshness.set(id, typeof updated_at === "string" ? updated_at : null);
          }
        }

        const todo = leadIds
          .filter((id) => {
            const updated_at = freshness.get(id);
            if (!updated_at) return true;
            return updated_at < cooldownSince;
          })
          .slice(0, 2);
        for (const id of todo) {
          const gen = await generateLeadResearch({ service, leadId: id });
          if (!gen.ok) continue;
          await upsertLeadResearchNotes({ service, leadId: id, generated: gen.research });
        }
      }
    }
  } catch {
    // Cron darf wegen Research niemals failen.
  }

  const res = await runLeadmaschine({ service, actorId: null });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 500 });
  }
  return NextResponse.json(res);
}

// Vercel Cron ruft GET auf; POST bleibt f\u00fcr manuelle / Legacy-Ausl\u00f6ser erlaubt.
export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
