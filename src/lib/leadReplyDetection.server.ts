import type { SupabaseClient } from "@supabase/supabase-js";
import { extractReplyTokenFromText } from "@/lib/leadReplyToken";

/**
 * Extrahiert die reine E-Mail-Adresse aus einem `From`-Header
 * (z. B. `"Max Mustermann" <max@example.com>` → `max@example.com`).
 */
function extractEmailAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle?.[1] ?? raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate;
}

async function findLeadIdByToken(
  service: SupabaseClient,
  token: string,
): Promise<string | null> {
  const res = await service
    .from("lead_messages")
    .select("lead_id")
    .eq("reply_token", token)
    .limit(1)
    .maybeSingle();
  const raw = (res.data as { lead_id?: unknown } | null)?.lead_id;
  return typeof raw === "string" ? raw : null;
}

/**
 * Robust gegen Tokens, die im Quote der Antwort nicht (mehr) enthalten sind:
 * Sucht über die From-Adresse den jüngsten Lead, an den wir geschrieben haben.
 * Greift sowohl auf `lead_messages.to_email` (tatsächlich versendete Empfänger)
 * als auch auf `leads.contact_email` (gepflegter Lead-Kontakt) zu.
 */
async function findLeadIdByFromAddress(
  service: SupabaseClient,
  fromEmail: string,
): Promise<string | null> {
  // 1) Empfänger aus tatsächlich versendeten Mails (sicher, weil unsere Outreach).
  const msgRes = await service
    .from("lead_messages")
    .select("lead_id, sent_at")
    .ilike("to_email", fromEmail)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  if (!msgRes.error) {
    const row = (msgRes.data as Array<{ lead_id?: string }> | null)?.[0];
    if (row?.lead_id) return row.lead_id;
  }

  // 2) Lead-Kontakt (auch ohne erfolgreichen Send als Fallback).
  const leadRes = await service
    .from("leads")
    .select("id, contact_email")
    .ilike("contact_email", fromEmail)
    .limit(1);
  if (!leadRes.error) {
    const row = (leadRes.data as Array<{ id?: string }> | null)?.[0];
    if (row?.id) return row.id;
  }

  return null;
}

export async function markLeadRepliedFromInbound(input: {
  service: SupabaseClient;
  subject: string | null;
  text: string | null;
  from: string | null;
  source: "gmail" | "inbound";
}): Promise<{ ok: true; leadId: string; via: "token" | "from" } | { ok: false; error: string }> {
  const subject = input.subject ?? "";
  const text = input.text ?? "";
  const fromEmail = extractEmailAddress(input.from);

  const token =
    extractReplyTokenFromText(subject) ?? extractReplyTokenFromText(text);

  let leadId: string | null = null;
  let via: "token" | "from" = "token";
  if (token) {
    leadId = await findLeadIdByToken(input.service, token);
  }
  if (!leadId && fromEmail) {
    leadId = await findLeadIdByFromAddress(input.service, fromEmail);
    if (leadId) via = "from";
  }

  if (!leadId) {
    return {
      ok: false,
      error: token ? "Lead nicht gefunden." : "Kein Reply-Token gefunden.",
    };
  }

  const upd = await input.service
    .from("leads")
    .update({ stage: "replied", next_action_at: null })
    .eq("id", leadId);
  if (upd.error) return { ok: false, error: upd.error.message };

  const ev = await input.service.from("lead_outreach_events").insert({
    lead_id: leadId,
    event_type: "reply_detected",
    channel: "email",
    status: "ok",
    metadata: {
      source: input.source,
      from: input.from ?? null,
      from_email_normalized: fromEmail,
      subject: subject || null,
      token: token ?? null,
      matched_via: via,
    },
  });
  if (ev.error) return { ok: false, error: ev.error.message };

  return { ok: true, leadId, via };
}

