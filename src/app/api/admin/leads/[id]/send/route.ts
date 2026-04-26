import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { getGmailClient, getGmailUserEmail } from "@/lib/gmailClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isEmail(v: string): boolean {
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRfc822Email(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const subject = input.subject.replace(/\r?\n/g, " ").trim();
  const body = input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "",
  ].join("\r\n");
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const leadId = cleanText(id);
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
  const messageId = cleanText(b.message_id);
  if (!messageId) {
    return NextResponse.json({ error: "message_id ist erforderlich." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const leadRes = await ctx.service
    .from("leads")
    .select("id, company_name, contact_email")
    .eq("id", leadId)
    .maybeSingle();
  if (leadRes.error) {
    return NextResponse.json({ error: leadRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const lead = leadRes.data as { id: string; company_name: string; contact_email?: string | null } | null;
  if (!lead?.id) {
    return NextResponse.json({ error: "Lead nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const to = typeof lead.contact_email === "string" ? lead.contact_email.trim() : "";
  if (!isEmail(to)) {
    return NextResponse.json(
      { error: "Kontakt-E‑Mail fehlt oder ist ungültig." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const msgRes = await ctx.service
    .from("lead_messages")
    .select("id, subject, body, sent_at, message_type")
    .eq("id", messageId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (msgRes.error) {
    return NextResponse.json({ error: msgRes.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const msg = msgRes.data as
    | { id: string; subject?: string | null; body: string; sent_at?: string | null; message_type?: string | null }
    | null;
  if (!msg?.id) {
    return NextResponse.json({ error: "Nachricht nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }
  if (msg.sent_at) {
    return NextResponse.json({ ok: true, already_sent: true }, { headers: NO_STORE_HEADERS });
  }

  const settingsRow = await ctx.service
    .from("leadmaschine_settings")
    .select("min_seconds_between_gmail_sends")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const minGapRaw = (settingsRow.data as { min_seconds_between_gmail_sends?: unknown } | null)
    ?.min_seconds_between_gmail_sends;
  const minSecondsBetween =
    typeof minGapRaw === "number" && Number.isFinite(minGapRaw)
      ? Math.max(30, Math.min(3600, Math.round(minGapRaw)))
      : 120;

  const lastSentRes = await ctx.service
    .from("lead_messages")
    .select("sent_at")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastIso = (lastSentRes.data as { sent_at?: string | null } | null)?.sent_at;
  if (typeof lastIso === "string" && lastIso.trim()) {
    const elapsedSec = (Date.now() - Date.parse(lastIso)) / 1000;
    if (Number.isFinite(elapsedSec) && elapsedSec < minSecondsBetween) {
      const wait = Math.ceil(minSecondsBetween - elapsedSec);
      return NextResponse.json(
        {
          error: `Rate-Limit aktiv: bitte ${wait}s warten (langsamer Versand reduziert Spam-Risiko).`,
          retry_after_seconds: wait,
        },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(wait) },
        },
      );
    }
  }

  const from = getGmailUserEmail();
  const subject =
    typeof msg.subject === "string" && msg.subject.trim()
      ? msg.subject.trim()
      : `Kontakt: ${lead.company_name}`;

  const raw = buildRfc822Email({ from, to, subject, body: msg.body });
  const gmail = getGmailClient();

  let gmailId: string | null = null;
  let threadId: string | null = null;
  try {
    const send = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: base64UrlEncode(raw) },
    });
    gmailId = typeof send.data.id === "string" ? send.data.id : null;
    threadId = typeof send.data.threadId === "string" ? send.data.threadId : null;
  } catch (e) {
    const msgErr = e instanceof Error ? e.message : "Gmail Versand fehlgeschlagen.";
    await ctx.service.from("lead_outreach_events").insert({
      lead_id: leadId,
      event_type: "manual_note",
      channel: "email",
      status: "error",
      metadata: { actor: ctx.actorId, action: "send", message_id: msg.id, error: msgErr },
    });
    return NextResponse.json({ error: msgErr }, { status: 502, headers: NO_STORE_HEADERS });
  }

  const sentAt = new Date().toISOString();

  await ctx.service
    .from("lead_messages")
    .update({
      sent_at: sentAt,
      gmail_message_id: gmailId,
      gmail_thread_id: threadId,
      to_email: to,
    })
    .eq("id", msg.id);

  await ctx.service.from("lead_outreach_events").insert({
    lead_id: leadId,
    event_type: `${(msg.message_type ?? "mail_1")}_sent`,
    channel: "email",
    status: "sent",
    metadata: { actor: ctx.actorId, message_id: msg.id, gmail_message_id: gmailId, gmail_thread_id: threadId },
  });

  await ctx.service
    .from("leads")
    .update({ last_contacted_at: sentAt })
    .eq("id", leadId);

  return NextResponse.json(
    { ok: true, gmail_message_id: gmailId, gmail_thread_id: threadId },
    { headers: NO_STORE_HEADERS },
  );
}

