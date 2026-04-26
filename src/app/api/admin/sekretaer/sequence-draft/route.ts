import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { generateOutreachMessage } from "@/lib/leadOutreachCopy.server";
import { buildResearchContextForPrompt, fetchLeadResearchNotes } from "@/lib/leadResearch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function assertKind(raw: unknown): "mail_1" | "follow_up" | "demo" {
  if (raw === "mail_1" || raw === "follow_up" || raw === "demo") return raw;
  throw new Error("Ungültiger Typ.");
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const leadId = cleanText(b.lead_id);
  if (!leadId) {
    return NextResponse.json({ error: "Lead-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let kind: "mail_1" | "follow_up" | "demo";
  try {
    kind = assertKind(b.kind);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ungültiger Typ." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const leadRes = await ctx.service
    .from("leads")
    .select(
      "id, company_name, domain, industry, market_segment, employee_count, revenue_eur, hq_location, lead_segment, stage",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadRes.error) {
    return NextResponse.json({ error: leadRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const lead = leadRes.data as
    | {
        id: string;
        company_name: string;
        domain?: string | null;
        industry?: string | null;
        market_segment?: string | null;
        employee_count?: number | null;
        revenue_eur?: number | null;
        hq_location?: string | null;
        lead_segment?: string | null;
        stage?: string | null;
      }
    | null;
  if (!lead?.id) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const seg = lead.lead_segment === "smb" ? "smb" : "enterprise";
  const research = await fetchLeadResearchNotes({ service: ctx.service, leadId });
  const research_context = buildResearchContextForPrompt(research);
  const msg = await generateOutreachMessage({
    kind,
    lead: {
      company_name: lead.company_name,
      domain: typeof lead.domain === "string" ? lead.domain : null,
      industry: typeof lead.industry === "string" ? lead.industry : null,
      market_segment:
        typeof lead.market_segment === "string" ? lead.market_segment : null,
      employee_count:
        typeof lead.employee_count === "number" ? lead.employee_count : null,
      revenue_eur: typeof lead.revenue_eur === "number" ? lead.revenue_eur : null,
      hq_location:
        typeof lead.hq_location === "string" ? lead.hq_location : null,
      lead_segment: seg,
      research_context,
    },
  });

  return NextResponse.json(
    {
      draft: {
        lead_id: leadId,
        kind,
        subject: msg.subject,
        body: msg.body,
        model: msg.model,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

