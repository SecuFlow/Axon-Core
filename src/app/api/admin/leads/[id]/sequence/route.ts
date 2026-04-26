import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { generateOutreachMessage } from "@/lib/leadOutreachCopy.server";
import {
  appendReplyTokenToSubject,
  generateLeadReplyToken,
} from "@/lib/leadReplyToken";
import {
  ensureLeadDemoLink,
  getPublicSiteUrlFromRequest,
  getSmbBookingUrlFromEnv,
} from "@/lib/leadDemoLink.server";
import { sequenceFollowUpDays } from "@/lib/leadmaschineTiming";
import {
  buildResearchContextForPrompt,
  fetchLeadResearchNotes,
} from "@/lib/leadResearch.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type LeadRow = {
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
};

function nextActionAtMinutes(mins: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function assertAction(
  raw: unknown,
): "mail_1" | "follow_up" | "demo" | "disqualify" | "mark_replied" {
  if (
    raw === "mail_1" ||
    raw === "follow_up" ||
    raw === "demo" ||
    raw === "disqualify" ||
    raw === "mark_replied"
  ) {
    return raw;
  }
  throw new Error("Ungültige Aktion.");
}

export async function POST(
  request: NextRequest,
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

  let reqBody: { action?: unknown };
  try {
    reqBody = (await request.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let action: "mail_1" | "follow_up" | "demo" | "disqualify" | "mark_replied";
  try {
    action = assertAction(reqBody.action);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ungültige Aktion." },
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
  const lead = leadRes.data as LeadRow | null;
  if (!lead?.id) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  if (action === "disqualify") {
    const upd = await ctx.service
      .from("leads")
      .update({
        stage: "disqualified",
        next_action_at: null,
      })
      .eq("id", leadId);
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    await ctx.service.from("lead_outreach_events").insert({
      lead_id: leadId,
      event_type: "disqualified",
      channel: "email",
      status: "ok",
      metadata: { actor: ctx.actorId },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  if (action === "mark_replied") {
    const upd = await ctx.service
      .from("leads")
      .update({
        stage: "replied",
        next_action_at: null,
      })
      .eq("id", leadId);
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500, headers: NO_STORE_HEADERS });
    }

    await ctx.service.from("lead_outreach_events").insert({
      lead_id: leadId,
      event_type: "reply_detected",
      channel: "email",
      status: "ok",
      metadata: { actor: ctx.actorId, source: "manual" },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }

  const kind = action;
  const seg = lead.lead_segment === "smb" ? "smb" : "enterprise";
  const research = await fetchLeadResearchNotes({ service: ctx.service, leadId });
  const research_context = buildResearchContextForPrompt(research);
  const msg = await generateOutreachMessage({
    kind,
    lead: {
      company_name: lead.company_name,
      domain: typeof lead.domain === "string" ? lead.domain : null,
      industry: typeof lead.industry === "string" ? lead.industry : null,
      market_segment: typeof lead.market_segment === "string" ? lead.market_segment : null,
      employee_count: typeof lead.employee_count === "number" ? lead.employee_count : null,
      revenue_eur: typeof lead.revenue_eur === "number" ? lead.revenue_eur : null,
      hq_location: typeof lead.hq_location === "string" ? lead.hq_location : null,
      lead_segment: seg,
      research_context,
    },
  });

  let demoLink: string | null = null;
  if (kind === "demo") {
    try {
      const ensured = await ensureLeadDemoLink({
        service: ctx.service,
        leadId,
        actorId: ctx.actorId,
      });
      const base = getPublicSiteUrlFromRequest(request);
      demoLink = base
        ? `${base}/api/public/demo-link/${encodeURIComponent(ensured.token)}`
        : ensured.url;
    } catch {
      demoLink = null;
    }
  }

  const replyToken = generateLeadReplyToken();
  const subject = appendReplyTokenToSubject(msg.subject, replyToken);
  const bookingUrl = kind === "demo" && seg === "smb" ? getSmbBookingUrlFromEnv() : null;
  const emailBody =
    kind === "demo" && seg === "enterprise" && demoLink
      ? `${msg.body}\n\nDemo‑Link: ${demoLink}`
      : kind === "demo" && seg === "smb" && bookingUrl
        ? `${msg.body}\n\nBeratungsgespräch buchen: ${bookingUrl}`
        : msg.body;

  const messageInsert = await ctx.service
    .from("lead_messages")
    .insert({
      lead_id: leadId,
      message_type: kind,
      reply_token: replyToken,
      subject,
      body: emailBody,
      metadata: { model: msg.model, actor: ctx.actorId, demo_link: demoLink },
    })
    .select("id")
    .single();
  if (messageInsert.error) {
    if (messageInsert.error.message.includes("lead_messages")) {
      return NextResponse.json(
        { error: "Leadmaschine ist noch nicht migriert." },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: messageInsert.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const stage =
    kind === "mail_1" ? "mail_1" : kind === "follow_up" ? "follow_up" : "demo_sent";

  const delays = sequenceFollowUpDays(seg);
  const next_action_at =
    kind === "mail_1"
      ? nextActionAtMinutes(60 * 24 * delays.afterMail1)
      : kind === "follow_up"
        ? nextActionAtMinutes(60 * 24 * delays.afterFollowUp)
        : null;

  const upd = await ctx.service
    .from("leads")
    .update({
      stage,
      last_contacted_at: new Date().toISOString(),
      next_action_at,
    })
    .eq("id", leadId);
  if (upd.error) {
    return NextResponse.json({ error: upd.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  await ctx.service.from("lead_outreach_events").insert({
    lead_id: leadId,
    event_type: `${kind}_sent`,
    channel: "email",
    status: "prepared",
    metadata: { message_id: messageInsert.data?.id ?? null, actor: ctx.actorId },
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

