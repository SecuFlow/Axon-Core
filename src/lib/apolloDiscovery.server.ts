/**
 * Apollo Discovery: orchestriert Search -> Bulk-Enrich -> Insert in `leads`.
 *
 * Aufruf-Reihenfolge im Cron `/api/cron/leadmaschine-discover`:
 *   1) Settings laden (apollo_enabled, Filter, Tages-Splits)
 *   2) Pro Segment (enterprise/smb): Search (kostenlos) -> Pre-Filter
 *   3) Top-N nach has_email=true werden in 10er-Chunks via bulk_match enriched
 *   4) Resultate werden mit dedupe_key + apollo_person_id in `leads` insertet
 *   5) Run-Statistik in apollo_discovery_runs persistieren
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ApolloApiError,
  bulkMatchPeople,
  buildEmployeeRange,
  searchPeople,
  type ApolloEnrichedPerson,
  type ApolloSearchFilters,
} from "@/lib/apolloClient.server";
import {
  checkLeadAuthenticity,
  resetDomainMxCache,
  type AuthenticityCheckSettings,
} from "@/lib/leadAuthenticityCheck.server";
import { qualifyApolloLead, type QualifierResult } from "@/lib/apolloLeadQualifier.server";

// Generische Postfächer hardcoded gegen UWG-§7-Verstoesse blockieren.
// Wird in leadmaschineRunner.server.ts auch verwendet — hier zusaetzlich
// schon beim Insert, damit wir keine Leads anlegen, die spaeter eh nicht
// versendet werden koennen.
const GENERIC_MAILBOX_LOCAL_PARTS = new Set([
  "info",
  "kontakt",
  "contact",
  "office",
  "hello",
  "hi",
  "team",
  "support",
  "service",
  "help",
  "mail",
  "marketing",
  "presse",
  "press",
  "media",
  "pr",
  "vertrieb",
  "sales",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "webmaster",
  "admin",
  "postmaster",
  "abuse",
]);

function isGenericMailbox(email: string): boolean {
  const at = email.indexOf("@");
  if (at <= 0) return true;
  const local = email.slice(0, at).trim().toLowerCase();
  return GENERIC_MAILBOX_LOCAL_PARTS.has(local);
}

function isPlausibleEmail(email: string | null | undefined): email is string {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type ApolloDiscoverySettings = {
  apollo_enabled: boolean;
  apollo_leads_per_day_enterprise: number;
  apollo_leads_per_day_smb: number;
  apollo_person_titles_enterprise: string[];
  apollo_person_titles_smb: string[];
  apollo_person_locations: string[];
  apollo_person_seniorities: string[];
  apollo_org_employee_min: number;
  apollo_org_employee_max: number;
  apollo_org_employee_min_smb: number;
  apollo_org_employee_max_smb: number;
  apollo_industries: string[];
  apollo_industries_smb: string[];
  apollo_reveal_personal_emails: boolean;
  // Phase 2: Echtheits-Check + LLM-ICP-Qualifikation
  apollo_qualification_enabled: boolean;
  apollo_qualification_threshold: number;
  apollo_min_revenue_eur_enterprise: number;
  apollo_min_revenue_eur_smb: number;
  apollo_blacklist_industries: string[];
  apollo_require_domain_mx: boolean;
  apollo_require_email_verified: boolean;
};

const DEFAULT_SETTINGS: ApolloDiscoverySettings = {
  apollo_enabled: false,
  apollo_leads_per_day_enterprise: 20,
  apollo_leads_per_day_smb: 10,
  apollo_person_titles_enterprise: [
    "Werkleiter",
    "Standortleiter",
    "Plant Manager",
    "Betriebsleiter",
    "Werksleiter",
    "Production Manager",
  ],
  apollo_person_titles_smb: [
    "Geschäftsführer",
    "Inhaber",
    "CEO",
    "Owner",
    "Founder",
    "Geschäftsleitung",
  ],
  apollo_person_locations: ["Germany", "Austria", "Switzerland"],
  apollo_person_seniorities: ["c_suite", "vp", "head", "director", "manager", "owner", "founder"],
  apollo_org_employee_min: 100,
  apollo_org_employee_max: 5000,
  apollo_org_employee_min_smb: 5,
  apollo_org_employee_max_smb: 99,
  apollo_industries: [],
  apollo_industries_smb: [],
  apollo_reveal_personal_emails: false,
  apollo_qualification_enabled: true,
  apollo_qualification_threshold: 7,
  apollo_min_revenue_eur_enterprise: 50_000_000,
  apollo_min_revenue_eur_smb: 5_000_000,
  apollo_blacklist_industries: [
    "staffing and recruiting",
    "marketing and advertising",
    "advertising services",
    "public relations and communications",
    "management consulting",
    "human resources services",
    "computer software",
    "information technology and services",
    "internet",
    "venture capital and private equity",
  ],
  apollo_require_domain_mx: true,
  apollo_require_email_verified: true,
};

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  return out.length > 0 ? out : fallback;
}

function asInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return fallback;
}

export async function loadApolloSettings(
  service: SupabaseClient,
): Promise<ApolloDiscoverySettings> {
  const res = await service
    .from("leadmaschine_settings")
    .select(
      "apollo_enabled, apollo_leads_per_day_enterprise, apollo_leads_per_day_smb, apollo_person_titles_enterprise, apollo_person_titles_smb, apollo_person_locations, apollo_person_seniorities, apollo_org_employee_min, apollo_org_employee_max, apollo_org_employee_min_smb, apollo_org_employee_max_smb, apollo_industries, apollo_industries_smb, apollo_reveal_personal_emails, apollo_qualification_enabled, apollo_qualification_threshold, apollo_min_revenue_eur_enterprise, apollo_min_revenue_eur_smb, apollo_blacklist_industries, apollo_require_domain_mx, apollo_require_email_verified",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error || !res.data) {
    // Fallback bei DB-Fehler oder leerer Tabelle: nochmal mit den
    // Pre-Phase-2-Spalten versuchen, damit die Discovery auch ohne die
    // ICP-Migration laufen kann.
    if (res.error) {
      const legacy = await service
        .from("leadmaschine_settings")
        .select(
          "apollo_enabled, apollo_leads_per_day_enterprise, apollo_leads_per_day_smb, apollo_person_titles_enterprise, apollo_person_titles_smb, apollo_person_locations, apollo_person_seniorities, apollo_org_employee_min, apollo_org_employee_max, apollo_org_employee_min_smb, apollo_org_employee_max_smb, apollo_industries, apollo_industries_smb, apollo_reveal_personal_emails",
        )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!legacy.error && legacy.data) {
        const r = legacy.data as Record<string, unknown>;
        return mergeIntoDefaults(r);
      }
    }
    return DEFAULT_SETTINGS;
  }

  return mergeIntoDefaults(res.data as Record<string, unknown>);
}

function mergeIntoDefaults(row: Record<string, unknown>): ApolloDiscoverySettings {
  return {
    apollo_enabled: row.apollo_enabled === true,
    apollo_leads_per_day_enterprise: asInt(
      row.apollo_leads_per_day_enterprise,
      DEFAULT_SETTINGS.apollo_leads_per_day_enterprise,
    ),
    apollo_leads_per_day_smb: asInt(
      row.apollo_leads_per_day_smb,
      DEFAULT_SETTINGS.apollo_leads_per_day_smb,
    ),
    apollo_person_titles_enterprise: asStringArray(
      row.apollo_person_titles_enterprise,
      DEFAULT_SETTINGS.apollo_person_titles_enterprise,
    ),
    apollo_person_titles_smb: asStringArray(
      row.apollo_person_titles_smb,
      DEFAULT_SETTINGS.apollo_person_titles_smb,
    ),
    apollo_person_locations: asStringArray(
      row.apollo_person_locations,
      DEFAULT_SETTINGS.apollo_person_locations,
    ),
    apollo_person_seniorities: asStringArray(
      row.apollo_person_seniorities,
      DEFAULT_SETTINGS.apollo_person_seniorities,
    ),
    apollo_org_employee_min: asInt(
      row.apollo_org_employee_min,
      DEFAULT_SETTINGS.apollo_org_employee_min,
    ),
    apollo_org_employee_max: asInt(
      row.apollo_org_employee_max,
      DEFAULT_SETTINGS.apollo_org_employee_max,
    ),
    apollo_org_employee_min_smb: asInt(
      row.apollo_org_employee_min_smb,
      DEFAULT_SETTINGS.apollo_org_employee_min_smb,
    ),
    apollo_org_employee_max_smb: asInt(
      row.apollo_org_employee_max_smb,
      DEFAULT_SETTINGS.apollo_org_employee_max_smb,
    ),
    apollo_industries: asStringArray(row.apollo_industries, []),
    apollo_industries_smb: asStringArray(row.apollo_industries_smb, []),
    apollo_reveal_personal_emails: row.apollo_reveal_personal_emails === true,
    apollo_qualification_enabled:
      row.apollo_qualification_enabled === undefined
        ? DEFAULT_SETTINGS.apollo_qualification_enabled
        : row.apollo_qualification_enabled === true,
    apollo_qualification_threshold: asInt(
      row.apollo_qualification_threshold,
      DEFAULT_SETTINGS.apollo_qualification_threshold,
    ),
    apollo_min_revenue_eur_enterprise: asInt(
      row.apollo_min_revenue_eur_enterprise,
      DEFAULT_SETTINGS.apollo_min_revenue_eur_enterprise,
    ),
    apollo_min_revenue_eur_smb: asInt(
      row.apollo_min_revenue_eur_smb,
      DEFAULT_SETTINGS.apollo_min_revenue_eur_smb,
    ),
    apollo_blacklist_industries: asStringArray(
      row.apollo_blacklist_industries,
      DEFAULT_SETTINGS.apollo_blacklist_industries,
    ),
    apollo_require_domain_mx:
      row.apollo_require_domain_mx === undefined
        ? DEFAULT_SETTINGS.apollo_require_domain_mx
        : row.apollo_require_domain_mx === true,
    apollo_require_email_verified:
      row.apollo_require_email_verified === undefined
        ? DEFAULT_SETTINGS.apollo_require_email_verified
        : row.apollo_require_email_verified === true,
  };
}

export type QualificationSummaryEntry = {
  apollo_person_id: string;
  company: string;
  manager: string;
  industry: string;
  score: number;
  qualified: boolean;
  reason: string;
  authenticity_reason?: string;
  llm_error?: string;
};

export type DiscoveryRunResult = {
  ok: boolean;
  segment: "enterprise" | "smb";
  target_count: number;
  searched_count: number;
  enriched_count: number;
  inserted_count: number;
  skipped_duplicate_count: number;
  skipped_no_email_count: number;
  skipped_generic_mailbox_count: number;
  skipped_authenticity_count: number;
  skipped_unqualified_count: number;
  apollo_credits_used: number;
  qualification_summary: QualificationSummaryEntry[];
  error?: string;
  run_id?: string;
};

function buildFilterSnapshot(
  segment: "enterprise" | "smb",
  filters: ApolloSearchFilters,
  targetCount: number,
): Record<string, unknown> {
  return {
    segment,
    target_count: targetCount,
    person_titles: filters.person_titles,
    person_locations: filters.person_locations,
    person_seniorities: filters.person_seniorities,
    organization_num_employees_ranges: filters.organization_num_employees_ranges,
    industries: filters.industries,
    contact_email_status: filters.contact_email_status,
  };
}

function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupeKeyFor(person: ApolloEnrichedPerson): string {
  // 1) Apollo-Person-ID Bestseller; aber dedupe_key wird auch fuer
  //    Cross-System-Konsistenz genutzt — daher zusaetzlich Email-basiert.
  const email = (person.email ?? "").trim().toLowerCase();
  const orgName = slugify(person.organization?.name ?? "");
  const orgCity = slugify(person.organization?.city ?? "");
  if (orgName && orgCity && email) {
    return `apollo:enterprise:${orgName}:${orgCity}:${email}`;
  }
  if (email) return `apollo:email:${email}`;
  return `apollo:person:${person.id}`;
}

function pickHqLocation(person: ApolloEnrichedPerson): string | null {
  const org = person.organization;
  if (!org) return null;
  const parts = [org.city, org.state, org.country].filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function buildPersonalizationHooksFromApollo(person: ApolloEnrichedPerson): string {
  const lines: string[] = [];
  if (person.title) lines.push(`Aktueller Titel: ${person.title}`);
  if (person.headline) lines.push(`LinkedIn-Headline: ${person.headline}`);
  if (person.organization?.short_description) {
    const desc = person.organization.short_description.slice(0, 280);
    lines.push(`Firmen-Beschreibung: ${desc}`);
  }
  if (person.organization?.estimated_num_employees) {
    lines.push(`Mitarbeiter (Apollo): ${person.organization.estimated_num_employees}`);
  }
  if (person.organization?.annual_revenue) {
    const r = person.organization.annual_revenue;
    const human = r >= 1_000_000 ? `${(r / 1_000_000).toFixed(1)} Mio €` : `${r} €`;
    lines.push(`Geschaetzter Jahresumsatz: ${human}`);
  }
  if (person.organization?.founded_year) {
    lines.push(`Gegruendet: ${person.organization.founded_year}`);
  }
  const tech = person.organization?.technologies ?? [];
  if (tech.length > 0) {
    lines.push(`Tech-Stack (Auswahl): ${tech.slice(0, 8).join(", ")}`);
  }
  const kw = person.organization?.keywords ?? [];
  if (kw.length > 0) {
    lines.push(`Keywords: ${kw.slice(0, 8).join(", ")}`);
  }
  return lines.join("\n");
}

async function logDiscoveryRun(
  service: SupabaseClient,
  payload: {
    started_at: string;
    finished_at: string | null;
    trigger: "cron" | "manual";
    segment: "enterprise" | "smb";
    target_count: number;
    searched_count: number;
    enriched_count: number;
    inserted_count: number;
    skipped_duplicate_count: number;
    skipped_no_email_count: number;
    skipped_generic_mailbox_count: number;
    skipped_authenticity_count: number;
    skipped_unqualified_count: number;
    apollo_credits_used: number;
    qualification_summary: QualificationSummaryEntry[];
    error_message: string | null;
    filter_snapshot: Record<string, unknown>;
  },
): Promise<string | null> {
  const ins = await service
    .from("apollo_discovery_runs")
    .insert(payload)
    .select("id")
    .single();
  if (!ins.error) {
    return (ins.data as { id?: string } | null)?.id ?? null;
  }

  // Fallback fuer Pre-Phase-2-Schemas: ohne neue Counter-Spalten erneut versuchen.
  const msg = (ins.error.message ?? "").toLowerCase();
  if (msg.includes("column") || msg.includes("schema")) {
    const legacyPayload = {
      started_at: payload.started_at,
      finished_at: payload.finished_at,
      trigger: payload.trigger,
      segment: payload.segment,
      target_count: payload.target_count,
      searched_count: payload.searched_count,
      enriched_count: payload.enriched_count,
      inserted_count: payload.inserted_count,
      skipped_duplicate_count: payload.skipped_duplicate_count,
      skipped_no_email_count: payload.skipped_no_email_count,
      skipped_generic_mailbox_count: payload.skipped_generic_mailbox_count,
      apollo_credits_used: payload.apollo_credits_used,
      error_message: payload.error_message,
      filter_snapshot: payload.filter_snapshot,
    };
    const legacy = await service
      .from("apollo_discovery_runs")
      .insert(legacyPayload)
      .select("id")
      .single();
    if (!legacy.error) {
      return (legacy.data as { id?: string } | null)?.id ?? null;
    }
  }
  return null;
}

async function persistResearchHooks(
  service: SupabaseClient,
  leadId: string,
  person: ApolloEnrichedPerson,
): Promise<void> {
  const hooks = buildPersonalizationHooksFromApollo(person);
  if (!hooks) return;
  // upsert defensiv: lead_research_notes ist optional, fail silent.
  try {
    await service
      .from("lead_research_notes")
      .upsert(
        {
          lead_id: leadId,
          summary: person.organization?.short_description ?? null,
          personalization_hooks: hooks,
          raw_notes: `Apollo-Discovery · person_id=${person.id}`,
          confidence: 70,
          sources: [
            person.linkedin_url
              ? { url: person.linkedin_url, title: "LinkedIn-Profil (Apollo)" }
              : null,
            person.organization?.website_url
              ? { url: person.organization.website_url, title: "Firmen-Website" }
              : null,
          ].filter(Boolean),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lead_id" },
      );
  } catch {
    // Research-Notes-Tabelle nicht zwingend; ignorieren.
  }
}

export async function runApolloDiscoveryForSegment(input: {
  service: SupabaseClient;
  segment: "enterprise" | "smb";
  trigger: "cron" | "manual";
  settingsOverride?: ApolloDiscoverySettings;
}): Promise<DiscoveryRunResult> {
  const startedAt = new Date().toISOString();
  const settings = input.settingsOverride ?? (await loadApolloSettings(input.service));

  const segment = input.segment;
  const targetCount =
    segment === "enterprise"
      ? Math.max(0, Math.min(100, settings.apollo_leads_per_day_enterprise))
      : Math.max(0, Math.min(100, settings.apollo_leads_per_day_smb));

  const baseResult: DiscoveryRunResult = {
    ok: true,
    segment,
    target_count: targetCount,
    searched_count: 0,
    enriched_count: 0,
    inserted_count: 0,
    skipped_duplicate_count: 0,
    skipped_no_email_count: 0,
    skipped_generic_mailbox_count: 0,
    skipped_authenticity_count: 0,
    skipped_unqualified_count: 0,
    apollo_credits_used: 0,
    qualification_summary: [],
  };

  // Domain-MX-Cache pro Run zuruecksetzen, damit ein langlaufender Server-Prozess
  // sich nicht an stale DNS-Antworten festbeisst.
  resetDomainMxCache();

  if (!settings.apollo_enabled) {
    return { ...baseResult, ok: true, error: "apollo_disabled" };
  }
  if (targetCount === 0) {
    return { ...baseResult, ok: true };
  }

  const filters: ApolloSearchFilters = {
    person_titles:
      segment === "enterprise"
        ? settings.apollo_person_titles_enterprise
        : settings.apollo_person_titles_smb,
    person_locations: settings.apollo_person_locations,
    person_seniorities: settings.apollo_person_seniorities,
    organization_num_employees_ranges:
      segment === "enterprise"
        ? buildEmployeeRange(settings.apollo_org_employee_min, settings.apollo_org_employee_max)
        : buildEmployeeRange(
            settings.apollo_org_employee_min_smb,
            settings.apollo_org_employee_max_smb,
          ),
    industries:
      segment === "enterprise"
        ? settings.apollo_industries
        : settings.apollo_industries_smb,
    contact_email_status: settings.apollo_require_email_verified
      ? ["verified"]
      : ["verified", "likely_to_engage"],
    include_similar_titles: true,
    page: 1,
    // Mit Echtheits-Check + LLM-Filter brauchen wir mehr Headroom:
    // ~30% Loss durch Echtheits-Check + ~30% durch LLM = ~50% effektiver Drop.
    // 5x targetCount ist ein Kompromiss zwischen Credit-Verbrauch und Reach.
    per_page: Math.min(100, Math.max(targetCount * 5, 50)),
  };

  const snapshot = buildFilterSnapshot(segment, filters, targetCount);

  let searchResp;
  try {
    searchResp = await searchPeople(filters);
  } catch (err) {
    const msg = err instanceof ApolloApiError ? `${err.message} (status ${err.status})` : err instanceof Error ? err.message : "Apollo search failed.";
    const finishedAt = new Date().toISOString();
    const runId = await logDiscoveryRun(input.service, {
      started_at: startedAt,
      finished_at: finishedAt,
      trigger: input.trigger,
      segment,
      target_count: targetCount,
      searched_count: 0,
      enriched_count: 0,
      inserted_count: 0,
      skipped_duplicate_count: 0,
      skipped_no_email_count: 0,
      skipped_generic_mailbox_count: 0,
      skipped_authenticity_count: 0,
      skipped_unqualified_count: 0,
      apollo_credits_used: 0,
      qualification_summary: [],
      error_message: msg.slice(0, 1000),
      filter_snapshot: snapshot,
    });
    return { ...baseResult, ok: false, error: msg, run_id: runId ?? undefined };
  }

  // Pre-Filter Stufe 1 (frei, keine Credits):
  //   - has_email=true (sonst lohnt sich Enrichment nicht)
  //   - industry vorhanden und NICHT in blacklist
  // Das spart 20-40% Credits, weil offensichtliche Disqualifikationen schon
  // hier rausfallen (z.B. Marketing-Agenturen, IT-Beratungen).
  const blacklistNorm = settings.apollo_blacklist_industries.map((b) =>
    b.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim(),
  );
  const candidatesAll = searchResp.people.filter((p) => {
    if (p.has_email !== true) return false;
    const ind = (p.organization?.industry ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
    if (!ind) return false;
    for (const b of blacklistNorm) {
      if (b && ind.includes(b)) return false;
    }
    return true;
  });
  // Buffer fuer Bulk-Match: bis zu 4x targetCount, capped at 100.
  const candidates = candidatesAll.slice(0, Math.min(100, targetCount * 4));
  baseResult.searched_count = searchResp.people.length;
  // Differenz searched -> candidates landet als skipped_authenticity gezaehlt
  // (Stufe 1 = Pre-Filter; gilt als Echtheits-Stufe, nicht als duplicate).
  baseResult.skipped_authenticity_count += searchResp.people.length - candidatesAll.length;

  // Existierende apollo_person_ids einmal vorab holen, um Duplikate zu sparen.
  const candidateIds = candidates.map((c) => c.id);
  let knownIds = new Set<string>();
  if (candidateIds.length > 0) {
    const dupRes = await input.service
      .from("leads")
      .select("apollo_person_id")
      .in("apollo_person_id", candidateIds);
    if (!dupRes.error) {
      for (const r of dupRes.data ?? []) {
        const v = (r as { apollo_person_id?: unknown }).apollo_person_id;
        if (typeof v === "string") knownIds.add(v);
      }
    }
  }
  const dedupCandidates = candidates.filter((c) => !knownIds.has(c.id));
  baseResult.skipped_duplicate_count += candidates.length - dedupCandidates.length;

  // Bulk-Match in 10er-Batches. Wir enrichen mehr als targetCount, weil der
  // Echtheits-Check + LLM-Qualifier nochmal ~50% rauswerfen koennen.
  // Cap: 4x targetCount Credits (worst case 30 Leads -> 120 Credits/Run).
  const enrichBudget = Math.min(dedupCandidates.length, targetCount * 4);
  const enrichTargets = dedupCandidates.slice(0, enrichBudget);

  const enriched: ApolloEnrichedPerson[] = [];
  for (let i = 0; i < enrichTargets.length; i += 10) {
    if (enriched.length >= enrichBudget) break;
    const batch = enrichTargets.slice(i, i + 10).map((p) => p.id);
    try {
      const r = await bulkMatchPeople(batch, {
        reveal_personal_emails: settings.apollo_reveal_personal_emails,
      });
      enriched.push(...r.matched);
      baseResult.apollo_credits_used += r.credits_used;
    } catch (err) {
      const msg = err instanceof ApolloApiError ? `${err.message} (status ${err.status})` : err instanceof Error ? err.message : "bulk_match failed";
      // Auf API-Fehler abbrechen, aber bisherige Treffer behalten.
      baseResult.error = msg;
      break;
    }
  }
  baseResult.enriched_count = enriched.length;

  const authSettings: AuthenticityCheckSettings = {
    apollo_blacklist_industries: settings.apollo_blacklist_industries,
    apollo_require_domain_mx: settings.apollo_require_domain_mx,
    apollo_require_email_verified: settings.apollo_require_email_verified,
  };

  // Insert in `leads`, capped at targetCount.
  let insertedCount = 0;
  let skippedNoEmail = 0;
  let skippedGeneric = 0;
  let skippedDup = 0;
  let skippedAuth = 0;
  let skippedUnqualified = 0;

  for (const person of enriched) {
    if (insertedCount >= targetCount) break;

    const orgNameLog = person.organization?.name ?? "?";
    const managerLog =
      [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
      person.name ||
      "?";
    const industryLog = person.organization?.industry ?? "";

    // === Stufe 2: Echtheits-Check ===
    const auth = await checkLeadAuthenticity(person, authSettings);
    if (!auth.ok) {
      skippedAuth++;
      baseResult.qualification_summary.push({
        apollo_person_id: person.id,
        company: orgNameLog,
        manager: managerLog,
        industry: industryLog,
        score: 0,
        qualified: false,
        reason: `Echtheit: ${auth.reason}${auth.detail ? " · " + auth.detail.slice(0, 60) : ""}`,
        authenticity_reason: auth.reason,
      });
      continue;
    }

    // Schnellpruefungen, die historisch separat gezaehlt wurden:
    const email = (person.email ?? "").trim();
    if (!isPlausibleEmail(email)) {
      skippedNoEmail++;
      continue;
    }
    if (isGenericMailbox(email)) {
      skippedGeneric++;
      continue;
    }

    // === Stufe 3: LLM-ICP-Qualifikation ===
    let qualifierResult: QualifierResult = {
      qualified: true,
      score: 0,
      reason: "(LLM-Filter deaktiviert)",
    };
    if (settings.apollo_qualification_enabled) {
      const minRev =
        segment === "enterprise"
          ? settings.apollo_min_revenue_eur_enterprise
          : settings.apollo_min_revenue_eur_smb;
      qualifierResult = await qualifyApolloLead({
        person,
        segment,
        thresholds: {
          score: settings.apollo_qualification_threshold,
          min_revenue_eur: minRev,
        },
        blacklist_industries: settings.apollo_blacklist_industries,
      });
    }

    baseResult.qualification_summary.push({
      apollo_person_id: person.id,
      company: orgNameLog,
      manager: managerLog,
      industry: industryLog,
      score: qualifierResult.score,
      qualified: qualifierResult.qualified,
      reason: qualifierResult.reason.slice(0, 200),
      llm_error: qualifierResult.error,
    });

    if (!qualifierResult.qualified) {
      skippedUnqualified++;
      continue;
    }

    const dedupe_key = dedupeKeyFor(person);

    const orgName =
      typeof person.organization?.name === "string" ? person.organization.name : "Unbekannt";
    const orgCity = typeof person.organization?.city === "string" ? person.organization.city : "";
    const company_name = orgCity ? `${orgName} – ${orgCity}` : orgName;

    const managerName =
      [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
      person.name ||
      null;

    const lead = {
      apollo_person_id: person.id,
      dedupe_key,
      company_name: company_name.slice(0, 512),
      domain: person.organization?.primary_domain
        ? person.organization.primary_domain.slice(0, 255)
        : person.organization?.website_url
          ? new URL(person.organization.website_url).hostname.replace(/^www\./, "").slice(0, 255)
          : null,
      contact_email: email.slice(0, 320),
      industry: person.organization?.industry ? person.organization.industry.slice(0, 128) : null,
      hq_location: pickHqLocation(person)?.slice(0, 1024) ?? null,
      employee_count: person.organization?.estimated_num_employees ?? null,
      revenue_eur: person.organization?.annual_revenue ?? null,
      lead_segment: segment,
      stage: "new" as const,
      next_action_at: new Date().toISOString(),
      manager_name: managerName?.slice(0, 256) ?? null,
      linkedin_url: person.linkedin_url ? person.linkedin_url.slice(0, 512) : null,
      corporate_group_name: orgName.slice(0, 256),
      location_name: orgCity ? orgCity.slice(0, 256) : null,
      department: person.title ? person.title.slice(0, 128) : null,
      research_source: "Apollo.io API Discovery",
      notes: [
        `Apollo Person-ID: ${person.id}`,
        person.headline ? `Headline: ${person.headline}` : null,
        person.organization?.short_description
          ? `Firma: ${person.organization.short_description.slice(0, 240)}`
          : null,
        person.email_status ? `Email-Status: ${person.email_status}` : null,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 2048),
    };

    const ins = await input.service.from("leads").insert(lead).select("id").single();
    if (ins.error) {
      // Unique-Violation = Duplikat (apollo_person_id_uq oder dedupe_key)
      const m = (ins.error.message ?? "").toLowerCase();
      if (m.includes("duplicate") || m.includes("23505") || m.includes("unique")) {
        skippedDup++;
        continue;
      }
      // Sonstige Fehler: einzelne Inserts duerfen den Run nicht killen.
      continue;
    }
    insertedCount++;

    // Research-Hooks aus Apollo-Daten persistieren (best-effort)
    const newId = (ins.data as { id?: string } | null)?.id ?? null;
    if (newId) {
      await persistResearchHooks(input.service, newId, person);
    }
  }

  baseResult.inserted_count = insertedCount;
  baseResult.skipped_no_email_count = skippedNoEmail;
  baseResult.skipped_generic_mailbox_count = skippedGeneric;
  baseResult.skipped_duplicate_count += skippedDup;
  baseResult.skipped_authenticity_count += skippedAuth;
  baseResult.skipped_unqualified_count = skippedUnqualified;

  // Summary-Begrenzung fuer DB (Top 30, sortiert nach score desc).
  const trimmedSummary = baseResult.qualification_summary
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  const finishedAt = new Date().toISOString();
  const runId = await logDiscoveryRun(input.service, {
    started_at: startedAt,
    finished_at: finishedAt,
    trigger: input.trigger,
    segment,
    target_count: targetCount,
    searched_count: baseResult.searched_count,
    enriched_count: baseResult.enriched_count,
    inserted_count: baseResult.inserted_count,
    skipped_duplicate_count: baseResult.skipped_duplicate_count,
    skipped_no_email_count: baseResult.skipped_no_email_count,
    skipped_generic_mailbox_count: baseResult.skipped_generic_mailbox_count,
    skipped_authenticity_count: baseResult.skipped_authenticity_count,
    skipped_unqualified_count: baseResult.skipped_unqualified_count,
    apollo_credits_used: baseResult.apollo_credits_used,
    qualification_summary: trimmedSummary,
    error_message: baseResult.error ?? null,
    filter_snapshot: snapshot,
  });

  return { ...baseResult, run_id: runId ?? undefined };
}
