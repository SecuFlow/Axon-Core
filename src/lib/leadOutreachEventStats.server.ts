import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadOutreachSendStats24h = {
  recent_invalid_grant_24h: number;
  recent_auto_send_errors_24h: number;
  last_successful_auto_send_at: string | null;
};

/**
 * Zählt Auto-Send-Fehler in lead_outreach_events (Metadaten) der letzten 24h
 * und den letzten erfolgreichen Versand — gleiche Logik wie Gmail-Health im Admin.
 */
export async function fetchLeadOutreachSendStats24h(
  service: SupabaseClient,
): Promise<LeadOutreachSendStats24h> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [errorsRes, successRes] = await Promise.all([
    service
      .from("lead_outreach_events")
      .select("metadata, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
    service
      .from("lead_outreach_events")
      .select("created_at")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  let recentInvalidGrant = 0;
  let recentAutoSendErrors = 0;
  for (const row of errorsRes.data ?? []) {
    const metadata = (row as { metadata?: unknown }).metadata as
      | { auto_send_error?: unknown }
      | null;
    const err = metadata?.auto_send_error;
    if (typeof err !== "string" || err.length === 0) continue;
    recentAutoSendErrors += 1;
    if (err.toLowerCase().includes("invalid_grant")) {
      recentInvalidGrant += 1;
    }
  }

  const lastSuccessfulAutoSendAt =
    typeof (successRes.data?.[0] as { created_at?: unknown } | undefined)
      ?.created_at === "string"
      ? (successRes.data?.[0] as { created_at: string }).created_at
      : null;

  return {
    recent_invalid_grant_24h: recentInvalidGrant,
    recent_auto_send_errors_24h: recentAutoSendErrors,
    last_successful_auto_send_at: lastSuccessfulAutoSendAt,
  };
}
