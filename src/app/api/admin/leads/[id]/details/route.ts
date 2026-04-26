import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type LeadRow = {
  id: string;
  created_at: string;
  company_name: string;
  domain?: string | null;
  contact_email?: string | null;
  market_segment?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  revenue_eur?: number | null;
  hq_location?: string | null;
  lead_segment?: string | null;
  stage?: string | null;
  next_action_at?: string | null;
  last_contacted_at?: string | null;
  notes?: string | null;
};

export async function GET(
  _request: Request,
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

  const leadRes = await ctx.service
    .from("leads")
    .select(
      "id, created_at, company_name, domain, contact_email, market_segment, industry, employee_count, revenue_eur, hq_location, lead_segment, stage, next_action_at, last_contacted_at, notes",
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadRes.error) {
    if (leadRes.error.message.includes("leads")) {
      return NextResponse.json(
        { error: "Leadmaschine ist noch nicht migriert." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: leadRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const lead = leadRes.data as LeadRow | null;
  if (!lead?.id) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const [eventsRes, messagesRes] = await Promise.all([
    ctx.service
      .from("lead_outreach_events")
      .select("id, created_at, event_type, channel, status, metadata")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(200),
    ctx.service
      .from("lead_messages")
      .select("id, created_at, message_type, subject, body, metadata, sent_at, to_email, gmail_message_id, gmail_thread_id")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (eventsRes.error) {
    if (eventsRes.error.message.includes("lead_outreach_events")) {
      return NextResponse.json({ lead, events: [], messages: [] }, { headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: eventsRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  if (messagesRes.error) {
    if (messagesRes.error.message.includes("lead_messages")) {
      return NextResponse.json(
        { lead, events: eventsRes.data ?? [], messages: [] },
        { headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: messagesRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(
    {
      lead,
      events: eventsRes.data ?? [],
      messages: messagesRes.data ?? [],
    },
    { headers: NO_STORE_HEADERS },
  );
}

