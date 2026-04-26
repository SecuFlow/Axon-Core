import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadResearchNotes = {
  lead_id: string;
  summary: string | null;
  pain_points: string | null;
  personalization_hooks: string | null;
  sources: unknown;
  confidence: number;
  raw_notes: string | null;
  updated_at: string | null;
};

export async function fetchLeadResearchNotes(input: {
  service: SupabaseClient;
  leadId: string;
}): Promise<LeadResearchNotes | null> {
  const res = await input.service
    .from("lead_research_notes")
    .select(
      "lead_id, summary, pain_points, personalization_hooks, sources, confidence, raw_notes, updated_at",
    )
    .eq("lead_id", input.leadId)
    .maybeSingle();

  if (res.error) {
    // Tabelle evtl. noch nicht migriert – dann einfach keine Research Notes.
    if (res.error.message.includes("lead_research_notes")) return null;
    return null;
  }
  const r = res.data as
    | {
        lead_id?: unknown;
        summary?: unknown;
        pain_points?: unknown;
        personalization_hooks?: unknown;
        sources?: unknown;
        confidence?: unknown;
        raw_notes?: unknown;
        updated_at?: unknown;
      }
    | null;

  if (!r || typeof r.lead_id !== "string") return null;
  return {
    lead_id: r.lead_id,
    summary: typeof r.summary === "string" && r.summary.trim() ? r.summary : null,
    pain_points:
      typeof r.pain_points === "string" && r.pain_points.trim() ? r.pain_points : null,
    personalization_hooks:
      typeof r.personalization_hooks === "string" && r.personalization_hooks.trim()
        ? r.personalization_hooks
        : null,
    sources: r.sources ?? [],
    confidence:
      typeof r.confidence === "number" && Number.isFinite(r.confidence)
        ? Math.max(0, Math.min(100, Math.round(r.confidence)))
        : 50,
    raw_notes:
      typeof r.raw_notes === "string" && r.raw_notes.trim() ? r.raw_notes : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

export function buildResearchContextForPrompt(
  notes: LeadResearchNotes | null,
): string | null {
  if (!notes) return null;
  const parts = [
    notes.summary ? `Kurzprofil:\n${notes.summary}` : null,
    notes.pain_points ? `Pain Points:\n${notes.pain_points}` : null,
    notes.personalization_hooks ? `Hooks:\n${notes.personalization_hooks}` : null,
    notes.raw_notes ? `Notizen:\n${notes.raw_notes}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const conf = Number.isFinite(notes.confidence) ? notes.confidence : 50;
  return `Research (Confidence ${conf}/100):\n${parts.join("\n\n")}`;
}

