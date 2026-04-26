import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import {
  appendReplyTokenToSubject,
  generateLeadReplyToken,
} from "@/lib/leadReplyToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanId(raw: string): string {
  return String(raw ?? "").trim();
}

function nextActionAtMinutes(mins: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const draftId = cleanId(id);
  if (!draftId) {
    return NextResponse.json({ error: "ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const dRes = await ctx.service
    .from("lead_sequence_drafts")
    .select("id,lead_id,kind,status,subject,body")
    .eq("id", draftId)
    .maybeSingle();
  if (dRes.error) {
    return NextResponse.json({ error: dRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const draft = dRes.data as
    | {
        id: string;
        lead_id: string;
        kind: string;
        status: string;
        subject: string;
        body: string;
      }
    | null;
  if (!draft?.id) {
    return NextResponse.json({ error: "Draft nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  if (draft.status !== "approved") {
    return NextResponse.json(
      { error: "Draft ist nicht freigegeben." },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const leadId = String(draft.lead_id);
  const kind = draft.kind === "mail_1" || draft.kind === "follow_up" || draft.kind === "demo" ? draft.kind : null;
  if (!kind) {
    return NextResponse.json({ error: "Ungültiger Draft-Typ." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const leadRes = await ctx.service
    .from("leads")
    .select("id,stage")
    .eq("id", leadId)
    .maybeSingle();
  if (leadRes.error) {
    return NextResponse.json({ error: leadRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const lead = leadRes.data as { id: string; stage?: string | null } | null;
  if (!lead?.id) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const replyToken = generateLeadReplyToken();
  const subject = appendReplyTokenToSubject(draft.subject, replyToken);

  const messageInsert = await ctx.service
    .from("lead_messages")
    .insert({
      lead_id: leadId,
      message_type: kind,
      reply_token: replyToken,
      subject,
      body: draft.body,
      metadata: { actor: ctx.actorId, source: "sekretaer_draft", draft_id: draftId },
    })
    .select("id")
    .single();
  if (messageInsert.error) {
    return NextResponse.json({ error: messageInsert.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const stage =
    kind === "mail_1" ? "mail_1" : kind === "follow_up" ? "follow_up" : "demo_sent";
  const next_action_at =
    kind === "mail_1"
      ? nextActionAtMinutes(60 * 24 * 3)
      : kind === "follow_up"
        ? nextActionAtMinutes(60 * 24 * 4)
        : null;

  const updLead = await ctx.service
    .from("leads")
    .update({
      stage,
      last_contacted_at: new Date().toISOString(),
      next_action_at,
    })
    .eq("id", leadId);
  if (updLead.error) {
    return NextResponse.json({ error: updLead.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  await ctx.service.from("lead_outreach_events").insert({
    lead_id: leadId,
    event_type: `${kind}_sent`,
    channel: "email",
    status: "prepared",
    metadata: { message_id: messageInsert.data?.id ?? null, actor: ctx.actorId, source: "sekretaer_draft" },
  });

  const pushedAt = new Date().toISOString();
  const up = await ctx.service
    .from("lead_sequence_drafts")
    .update({ status: "pushed", pushed_at: pushedAt, pushed_by: ctx.actorId, updated_at: pushedAt })
    .eq("id", draftId);
  if (up.error) {
    return NextResponse.json({ error: up.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

