import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function tryGetOpenAi(): OpenAI | null {
  const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function isoHoursAgo(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

type LeadBriefRow = {
  id: string;
  company_name: string;
  stage: string | null;
  next_action_at: string | null;
  created_at: string;
};

export async function buildDailyBriefing(input: {
  service: SupabaseClient;
}): Promise<{
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}> {
  const { service } = input;
  const now = new Date();
  const title = `Daily Briefing · ${now.toLocaleDateString("de-DE")}`;

  const leadsRes = await service
    .from("leads")
    .select("id,company_name,stage,next_action_at,created_at")
    .neq("stage", "disqualified")
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .limit(40);

  const leads = (leadsRes.data ?? []) as LeadBriefRow[];

  const due = leads.filter((l) => {
    if (!l.next_action_at) return false;
    const t = Date.parse(l.next_action_at);
    return Number.isFinite(t) && t <= Date.now();
  });

  const prepared30dRes = await service
    .from("lead_outreach_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", isoDaysAgo(30))
    .in("event_type", ["mail_1_sent", "follow_up_sent", "demo_sent"]);
  const prepared30d = prepared30dRes.count ?? 0;

  const replies24hRes = await service
    .from("lead_outreach_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", isoHoursAgo(24))
    .eq("event_type", "reply_detected");
  const replies24h = replies24hRes.count ?? 0;

  const settingsRes = await service
    .from("leadmaschine_settings")
    .select("enabled,leads_per_month,max_actions_per_run,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const settingsRow = settingsRes.data as
    | {
        enabled?: unknown;
        leads_per_month?: unknown;
        max_actions_per_run?: unknown;
      }
    | null;
  const enabled = settingsRow?.enabled === false ? false : true;
  const monthlyLimit =
    typeof settingsRow?.leads_per_month === "number" ? settingsRow.leads_per_month : 100;
  const remaining = Math.max(0, Math.min(2000, monthlyLimit) - prepared30d);

  const headline = [
    `Leads fällig: ${due.length}`,
    `Antworten (24h): ${replies24h}`,
    `Budget (30d): ${remaining}/${monthlyLimit}`,
    `Pipeline sichtbar: ${leads.length}`,
  ].join(" · ");

  const rows = due.slice(0, 12).map((l) => {
    const stage = (l.stage ?? "new").toUpperCase();
    const when = l.next_action_at ? new Date(l.next_action_at).toLocaleString("de-DE") : "—";
    return `- ${l.company_name} · ${stage} · fällig: ${when}`;
  });

  const topPriorities: string[] = [];
  if (replies24h > 0) topPriorities.push(`Antworten priorisieren (${replies24h} in 24h)`);
  if (due.length > 0) topPriorities.push(`Fällige Aktionen abarbeiten (${due.length})`);
  if (!enabled) topPriorities.push("Leadmaschine ist deaktiviert (Einstellung prüfen)");
  if (enabled && remaining <= 0) topPriorities.push("Monatsbudget ausgeschöpft (keine weiteren Aktionen)");
  if (topPriorities.length === 0) topPriorities.push("Pipeline erweitern (neue Enterprise‑Targets)");

  const priorityBlock =
    `Top 3 Prioritäten:\n` +
    topPriorities.slice(0, 3).map((p) => `- ${p}`).join("\n");

  const baseText =
    `${headline}\n\n` +
    `${priorityBlock}\n\n` +
    (rows.length ? rows.join("\n") : "Keine Aktionen sind aktuell fällig.") +
    `\n\n` +
    `Fokus heute:\n` +
    `- Engpässe in der Outreach-Kadenz erkennen\n` +
    `- Antworten priorisieren\n` +
    `- Neue Enterprise-Targets hinzufügen`;

  const openai = tryGetOpenAi();
  if (!openai) {
    return {
      title,
      content: baseText,
      metadata: {
        source: "heuristic",
        headline: { due: due.length, replies24h, remaining, monthlyLimit, prepared30d },
      },
    };
  }

  const model = (sanitizeEnv(process.env.OPENAI_GPT_MODEL) ?? "").trim() || "gpt-4o";
  const system =
    "Du bist der Axon-Sekretär (Admin-only). Schreibe ein tägliches Briefing auf Deutsch: knapp, souverän, keine Technikdetails. " +
    "Output als Plaintext, max. 180 Wörter, mit 3–6 Bullet Points, klarer Priorisierung (Top 3).";
  const user =
    `Daten (intern, nicht erwähnen):\n` +
    `Headline: ${headline}\n` +
    `Top 3 Prioritäten:\n${topPriorities.slice(0, 3).map((p) => `- ${p}`).join("\n")}\n\n` +
    `Fällig (max 12):\n${rows.join("\n")}\n\n` +
    `Erzeuge ein Briefing, ohne IDs/Slugs.`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.25,
      max_tokens: 320,
    });
    const text = (completion.choices[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("empty");
    return {
      title,
      content: text.slice(0, 4000),
      metadata: {
        source: "openai",
        model,
        headline: { due: due.length, replies24h, remaining, monthlyLimit, prepared30d },
      },
    };
  } catch {
    return {
      title,
      content: baseText,
      metadata: {
        source: "fallback",
        model,
        headline: { due: due.length, replies24h, remaining, monthlyLimit, prepared30d },
      },
    };
  }
}

