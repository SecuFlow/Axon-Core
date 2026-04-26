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

function normalizeDomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("://")) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchUrlText(url: string, timeoutMs = 6500): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "AxonCore/1.0 (Lead Research) +https://axoncore.example",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("text/html")) return null;
    const html = await resp.text();
    const text = stripHtml(html);
    if (!text) return null;
    return text.length > 7000 ? `${text.slice(0, 7000)}…` : text;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function noteForUrl(url: string): string {
  const u = url.toLowerCase();
  if (u.endsWith("/impressum")) return "Impressum";
  if (u.endsWith("/produkte")) return "Produkte";
  if (u.endsWith("/leistungen")) return "Leistungen";
  if (u.endsWith("/ueber-uns") || u.endsWith("/about") || u.endsWith("/unternehmen")) return "Über uns";
  return "Homepage";
}

export type GeneratedResearch = {
  summary: string | null;
  pain_points: string | null;
  personalization_hooks: string | null;
  confidence: number;
  raw_notes: string | null;
  sources: unknown;
  model: string | null;
};

function clampConfidence(v: unknown, fallback = 55): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildLowConfidenceWarning(input: {
  confidence: number;
  reason: string;
}): string {
  const c = clampConfidence(input.confidence, 0);
  return (
    `[WARNUNG · Research unsicher (${c}/100)]\n` +
    `${input.reason}\n` +
    `Bitte Quellen prüfen oder Research erneut generieren.\n`
  );
}

function mergeRawNotes(input: {
  warning: string | null;
  generated: string | null;
  existing: string | null;
}): string | null {
  const parts: string[] = [];
  if (input.warning) parts.push(input.warning.trim());
  if (input.generated) parts.push(input.generated.trim());
  if (!input.generated && input.existing) parts.push(input.existing.trim());
  const merged = parts.filter(Boolean).join("\n\n");
  if (!merged.trim()) return null;
  return merged.length > 12_000 ? `${merged.slice(0, 12_000)}…` : merged;
}

export async function generateLeadResearch(input: {
  service: SupabaseClient;
  leadId: string;
}): Promise<{ ok: true; research: GeneratedResearch } | { ok: false; error: string; status?: number }> {
  const openai = tryGetOpenAi();
  if (!openai) return { ok: false, error: "OPENAI_API_KEY fehlt.", status: 503 };

  const NEW_COLUMNS =
    "id, company_name, domain, industry, market_segment, employee_count, revenue_eur, hq_location, lead_segment, manager_name, linkedin_url, corporate_group_name, location_name, department, research_source";
  const LEGACY_COLUMNS =
    "id, company_name, domain, industry, market_segment, employee_count, revenue_eur, hq_location, lead_segment";

  let leadRes = await input.service
    .from("leads")
    .select(NEW_COLUMNS)
    .eq("id", input.leadId)
    .maybeSingle();

  if (
    leadRes.error &&
    (leadRes.error.message.toLowerCase().includes("column") ||
      leadRes.error.message.toLowerCase().includes("does not exist"))
  ) {
    const legacy = await input.service
      .from("leads")
      .select(LEGACY_COLUMNS)
      .eq("id", input.leadId)
      .maybeSingle();
    leadRes = legacy as unknown as typeof leadRes;
  }

  if (leadRes.error) return { ok: false, error: leadRes.error.message };
  const lead = leadRes.data as
    | {
        id?: unknown;
        company_name?: unknown;
        domain?: unknown;
        industry?: unknown;
        market_segment?: unknown;
        employee_count?: unknown;
        revenue_eur?: unknown;
        hq_location?: unknown;
        lead_segment?: unknown;
        manager_name?: unknown;
        linkedin_url?: unknown;
        corporate_group_name?: unknown;
        location_name?: unknown;
        department?: unknown;
        research_source?: unknown;
      }
    | null;
  if (!lead || typeof lead.id !== "string") return { ok: false, error: "Lead nicht gefunden.", status: 404 };

  const companyName = typeof lead.company_name === "string" ? lead.company_name.trim() : "";
  const domain = normalizeDomain(lead.domain);
  const seg = lead.lead_segment === "smb" ? "smb" : "enterprise";
  const corporateGroup =
    typeof lead.corporate_group_name === "string" ? lead.corporate_group_name.trim() : "";
  const locationName =
    typeof lead.location_name === "string" ? lead.location_name.trim() : "";
  const managerName =
    typeof lead.manager_name === "string" ? lead.manager_name.trim() : "";
  const linkedinUrl =
    typeof lead.linkedin_url === "string" ? lead.linkedin_url.trim() : "";
  const department =
    typeof lead.department === "string" ? lead.department.trim() : "";
  const researchSource =
    typeof lead.research_source === "string" ? lead.research_source.trim() : "";

  let snapshot: string | null = null;
  let fallbackSources: Array<{ url: string; title: string; note: string }> = [];

  if (domain) {
    const bases = [`https://${domain}`, `https://www.${domain}`];
    const paths = ["", "/ueber-uns", "/about", "/unternehmen", "/produkte", "/leistungen", "/impressum"];
    const candidateUrls: string[] = [];
    for (const b of bases) for (const p of paths) {
      const u = `${b}${p}`;
      if (!candidateUrls.includes(u)) candidateUrls.push(u);
    }

    const fetched = await Promise.all(
      candidateUrls.slice(0, 10).map(async (u) => ({ url: u, text: await fetchUrlText(u) })),
    );
    const chunks = fetched
      .filter((x) => typeof x.text === "string" && x.text.trim().length > 0)
      .slice(0, 3);

    if (chunks.length > 0) {
      fallbackSources = chunks.map((c) => ({ url: c.url, title: domain, note: noteForUrl(c.url) }));
      const merged = chunks.map((c) => `Quelle: ${c.url}\n${c.text}`).join("\n\n---\n\n");
      snapshot = merged.length > 9000 ? `${merged.slice(0, 9000)}…` : merged;
    }
  }

  const model = (sanitizeEnv(process.env.OPENAI_GPT_MODEL) ?? "").trim() || "gpt-4o";
  const hasLocation = !!(corporateGroup && locationName);
  const system =
    "Du bist ein B2B-Research Analyst. Du erstellst knappe, umsetzbare Research Notes für personalisierte Erstansprache auf STANDORT-Ebene eines Konzerns (nicht auf Gesamt-Konzern-Ebene). " +
    "Pain Points und Hooks beziehen sich auf den konkreten Standort, den dort arbeitenden Manager und seine typischen operativen Engpässe – NICHT auf abstrakte Konzern-Strategie. " +
    "Wenn ein LinkedIn-Profil des Managers angegeben ist, leite daraus plausible Rollen-/Bereichsschwerpunkte ab (z. B. Produktion, Instandhaltung, Qualität) und berücksichtige sie in den Hooks. " +
    "Keine technischen IDs, keine Slugs. Keine Demo-/Test-Wörter. " +
    "Output strikt als JSON Object mit Feldern: summary, pain_points, personalization_hooks, confidence (0-100), raw_notes, sources (Array von {url,title,note}). " +
    "summary: 2-5 Sätze, standortbezogen. pain_points/hooks: kurze Bullet-ähnliche Zeilen (Plaintext).";

  const user =
    `Lead (${hasLocation ? "Konzern-Standort" : "B2B"}):\n` +
    `Segment: ${seg}\n` +
    `Anzeigename: ${companyName}\n` +
    `${corporateGroup ? `Konzern: ${corporateGroup}\n` : ""}` +
    `${locationName ? `Standort: ${locationName}\n` : ""}` +
    `${managerName ? `Manager (Zielperson): ${managerName}\n` : ""}` +
    `${department ? `Abteilung: ${department}\n` : ""}` +
    `${linkedinUrl ? `LinkedIn des Managers: ${linkedinUrl}\n` : ""}` +
    `${researchSource ? `Recherche-Quelle: ${researchSource}\n` : ""}` +
    `${domain ? `Domain: ${domain}\n` : ""}` +
    `${typeof lead.industry === "string" && lead.industry.trim() ? `Branche: ${lead.industry}\n` : ""}` +
    `${typeof lead.market_segment === "string" && lead.market_segment.trim() ? `Marktsegment: ${lead.market_segment}\n` : ""}` +
    `${typeof lead.employee_count === "number" ? `Mitarbeiter (Standort/Konzern): ${lead.employee_count}\n` : ""}` +
    `${typeof lead.revenue_eur === "number" ? `Umsatz EUR/Jahr: ${lead.revenue_eur}\n` : ""}` +
    `${typeof lead.hq_location === "string" && lead.hq_location.trim() ? `Konzern-HQ: ${lead.hq_location}\n` : ""}` +
    `\n` +
    (snapshot
      ? `Website-Snapshot (aus HTML extrahiert, evtl. unvollständig):\n${snapshot}\n\n`
      : "Kein Website-Snapshot verfügbar (Domain fehlt oder Fetch fehlgeschlagen).\n\n") +
    (hasLocation
      ? `Erzeuge Research Notes für personalisierte Outreach-Copy an den Standort "${locationName}" von ${corporateGroup}${managerName ? `, adressiert an ${managerName}` : ""}. Fokus: operative Pain Points am Standort, keine Konzern-Strategie-Floskeln.`
      : `Erzeuge Research Notes für personalisierte Outreach-Copy.`);

  let parsed: {
    summary?: unknown;
    pain_points?: unknown;
    personalization_hooks?: unknown;
    confidence?: unknown;
    raw_notes?: unknown;
    sources?: unknown;
  } = {};

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 650,
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    parsed = JSON.parse(raw) as typeof parsed;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Research-Generation fehlgeschlagen.",
      status: 502,
    };
  }

  const summary = cleanText(parsed.summary, 4000);
  const pain_points = cleanText(parsed.pain_points, 8000);
  const personalization_hooks = cleanText(parsed.personalization_hooks, 8000);
  const confidence = clampConfidence(parsed.confidence, 55);
  const raw_notes = cleanText(parsed.raw_notes, 12_000);

  const modelSources =
    Array.isArray(parsed.sources) && parsed.sources.length > 0 ? parsed.sources.slice(0, 10) : [];
  const sources = modelSources.length > 0 ? modelSources : fallbackSources;

  // Quality Guard: falls OpenAI zwar JSON liefert, aber inhaltlich zu schwach ist,
  // persistieren wir eine klare Warnung (statt "leere" Notes).
  const missingCore =
    (summary == null ? 1 : 0) +
    (pain_points == null ? 1 : 0) +
    (personalization_hooks == null ? 1 : 0);
  const lowConfidence = confidence < 70;
  const needsWarning = lowConfidence || missingCore >= 2;
  const warning = needsWarning
    ? buildLowConfidenceWarning({
        confidence,
        reason: lowConfidence
          ? "Die Datenqualität liegt unter dem Enterprise‑Minimum."
          : "Zu wenig verwertbarer Inhalt aus Quellen/Modellantwort.",
      })
    : null;

  return {
    ok: true,
    research: {
      summary,
      pain_points,
      personalization_hooks,
      confidence,
      raw_notes: warning ? mergeRawNotes({ warning, generated: raw_notes, existing: null }) : raw_notes,
      sources,
      model,
    },
  };
}

export async function upsertLeadResearchNotes(input: {
  service: SupabaseClient;
  leadId: string;
  generated: GeneratedResearch;
}): Promise<{ ok: true; row: unknown } | { ok: false; error: string; status?: number }> {
  // Anti‑Corruption: niemals "gute" Research Notes mit leeren Feldern überschreiben.
  // Zudem: bei geringer Confidence muss eine Warnung sichtbar persistiert werden.
  let existing: {
    lead_id: string;
    summary: string | null;
    pain_points: string | null;
    personalization_hooks: string | null;
    sources: unknown;
    confidence: number | null;
    raw_notes: string | null;
    updated_at: string | null;
  } | null = null;

  try {
    const ex = await input.service
      .from("lead_research_notes")
      .select(
        "lead_id, summary, pain_points, personalization_hooks, sources, confidence, raw_notes, updated_at",
      )
      .eq("lead_id", input.leadId)
      .maybeSingle();
    type ExistingRow = {
      lead_id?: unknown;
      summary?: unknown;
      pain_points?: unknown;
      personalization_hooks?: unknown;
      sources?: unknown;
      confidence?: unknown;
      raw_notes?: unknown;
      updated_at?: unknown;
    };
    const r = ex.data as ExistingRow | null;
    if (!ex.error && r && typeof r.lead_id === "string") {
      existing = {
        lead_id: r.lead_id,
        summary: asStringOrNull(r.summary),
        pain_points: asStringOrNull(r.pain_points),
        personalization_hooks: asStringOrNull(r.personalization_hooks),
        sources: r.sources ?? [],
        confidence:
          typeof r.confidence === "number" && Number.isFinite(r.confidence)
            ? clampConfidence(r.confidence, 50)
            : null,
        raw_notes: asStringOrNull(r.raw_notes),
        updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
      };
    }
  } catch {
    // Best effort – falls die Tabelle/Policy noch nicht greift, behandelt das Upsert unten.
  }

  const genConf = clampConfidence(input.generated.confidence, 55);
  const warning =
    genConf < 70
      ? buildLowConfidenceWarning({
          confidence: genConf,
          reason: "Die Datenqualität liegt unter dem Enterprise‑Minimum.",
        })
      : null;

  const finalSummary = input.generated.summary ?? existing?.summary ?? null;
  const finalPain = input.generated.pain_points ?? existing?.pain_points ?? null;
  const finalHooks =
    input.generated.personalization_hooks ?? existing?.personalization_hooks ?? null;
  const finalSources =
    Array.isArray(input.generated.sources) && input.generated.sources.length > 0
      ? input.generated.sources
      : existing?.sources ?? [];
  const finalRaw = mergeRawNotes({
    warning,
    generated: input.generated.raw_notes,
    existing: existing?.raw_notes ?? null,
  });
  const finalConfidence =
    (existing?.confidence != null && existing.confidence >= 70 && genConf < 70)
      ? existing.confidence
      : genConf;

  const up = await input.service
    .from("lead_research_notes")
    .upsert(
      {
        lead_id: input.leadId,
        summary: finalSummary,
        pain_points: finalPain,
        personalization_hooks: finalHooks,
        raw_notes: finalRaw,
        sources: finalSources,
        confidence: finalConfidence,
        updated_at: nowIso(),
      },
      { onConflict: "lead_id" },
    )
    .select("lead_id, summary, pain_points, personalization_hooks, sources, confidence, raw_notes, updated_at")
    .single();

  if (up.error) {
    if (up.error.message.includes("lead_research_notes")) {
      return { ok: false, error: "Research-Layer ist noch nicht migriert.", status: 503 };
    }
    return { ok: false, error: up.error.message };
  }
  return { ok: true, row: up.data ?? null };
}

