import type { SupabaseClient } from "@supabase/supabase-js";
import { extractReplyTokenFromText } from "@/lib/leadReplyToken";

export async function markLeadRepliedFromInbound(input: {
  service: SupabaseClient;
  subject: string | null;
  text: string | null;
  from: string | null;
  source: "gmail" | "inbound";
}): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const subject = input.subject ?? "";
  const text = input.text ?? "";

  const token =
    extractReplyTokenFromText(subject) ?? extractReplyTokenFromText(text);
  if (!token) {
    return { ok: false, error: "Kein Reply-Token gefunden." };
  }

  const msgRes = await input.service
    .from("lead_messages")
    .select("lead_id, reply_token")
    .eq("reply_token", token)
    .limit(1)
    .maybeSingle();
  if (msgRes.error) return { ok: false, error: msgRes.error.message };
  const leadIdRaw = (msgRes.data as { lead_id?: unknown } | null)?.lead_id;
  const leadId = typeof leadIdRaw === "string" ? leadIdRaw : null;
  if (!leadId) return { ok: false, error: "Lead nicht gefunden." };

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
      subject: subject || null,
      token,
    },
  });
  if (ev.error) return { ok: false, error: ev.error.message };

  return { ok: true, leadId };
}

