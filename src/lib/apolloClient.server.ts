/**
 * Apollo.io API-Client (server-only).
 *
 * Doku:
 *   - Search: POST https://api.apollo.io/api/v1/mixed_people/api_search (kostenlos, kein Email/Phone)
 *   - Bulk Enrichment: POST https://api.apollo.io/api/v1/people/bulk_match (1 credit/person, 10/call)
 *
 * Workflow im AxonCore-Discovery-Run:
 *   1) searchPeople(filters)         -> Liste Apollo-IDs + Pre-Qualification
 *   2) bulkMatchPeople(ids[, opts])  -> echte Email + LinkedIn + Org-Details
 *
 * Auth: master API key in `x-api-key` header. Wird aus APOLLO_API_KEY gelesen.
 *
 * Keine externen Dependencies (nur fetch + URLSearchParams).
 */

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1";

function sanitizeEnv(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s/g, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ApolloApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApolloApiError";
    this.status = status;
    this.body = body;
  }
}

/** Validiert + holt den API-Key. Wirft, wenn nicht konfiguriert. */
export function getApolloApiKey(): string {
  const key = sanitizeEnv(process.env.APOLLO_API_KEY);
  if (!key) {
    throw new Error(
      "APOLLO_API_KEY fehlt. Bitte master API-Key in der ENV setzen (https://app.apollo.io/#/settings/integrations/api).",
    );
  }
  return key;
}

export type ApolloSearchFilters = {
  /** Job-Titel (mind. 1). Apollo matcht "ähnliche" Titel by default. */
  person_titles: string[];
  /** Personal location (Stadt/Land/State). Default: ['Germany']. */
  person_locations?: string[];
  /** Seniority-Level (c_suite|vp|head|director|manager|...). */
  person_seniorities?: string[];
  /** "1,10" | "100,500" | "1000,5000" — multiple ranges erlaubt. */
  organization_num_employees_ranges?: string[];
  /** Industries. Apollo nutzt seine eigenen industry-Bezeichner; Freitext klappt oft. */
  industries?: string[];
  /** HQ-Land/-Stadt der Firma (zusaetzlich zu person_locations). */
  organization_locations?: string[];
  /** Nur Personen mit gueltiger E-Mail (verified|likely_to_engage). */
  contact_email_status?: Array<"verified" | "unverified" | "likely_to_engage" | "unavailable">;
  /** Strikte Title-Matches (ohne "ähnliche" Title-Erweiterung). */
  include_similar_titles?: boolean;
  /** Pagination */
  page?: number;
  per_page?: number;
};

export type ApolloSearchResultPerson = {
  id: string;
  first_name: string | null;
  last_name_obfuscated: string | null;
  title: string | null;
  has_email: boolean;
  has_direct_phone: boolean;
  organization: {
    id?: string | null;
    name?: string | null;
    industry?: string | null;
    has_industry?: boolean;
    has_employee_count?: boolean;
    has_revenue?: boolean;
  } | null;
};

export type ApolloSearchResponse = {
  people: ApolloSearchResultPerson[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
};

/**
 * People API Search — KOSTENLOS, gibt aber KEINE Emails/Phones zurueck.
 * Liefert nur Pre-Qualification (id, has_email, has_direct_phone, org-flags).
 *
 * Display-Limit: 50.000 records (100/Page, max 500 Pages).
 */
export async function searchPeople(
  filters: ApolloSearchFilters,
  init?: { signal?: AbortSignal },
): Promise<ApolloSearchResponse> {
  const apiKey = getApolloApiKey();

  const params = new URLSearchParams();
  for (const t of filters.person_titles) {
    if (typeof t === "string" && t.trim()) params.append("person_titles[]", t.trim());
  }
  for (const l of filters.person_locations ?? []) {
    if (typeof l === "string" && l.trim()) params.append("person_locations[]", l.trim());
  }
  for (const s of filters.person_seniorities ?? []) {
    if (typeof s === "string" && s.trim()) params.append("person_seniorities[]", s.trim());
  }
  for (const r of filters.organization_num_employees_ranges ?? []) {
    if (typeof r === "string" && /^\d+,\d+$/.test(r.trim()))
      params.append("organization_num_employees_ranges[]", r.trim());
  }
  for (const ind of filters.industries ?? []) {
    if (typeof ind === "string" && ind.trim()) params.append("organization_industry_tag_ids[]", ind.trim());
  }
  for (const loc of filters.organization_locations ?? []) {
    if (typeof loc === "string" && loc.trim()) params.append("organization_locations[]", loc.trim());
  }
  for (const e of filters.contact_email_status ?? []) {
    if (typeof e === "string" && e.trim()) params.append("contact_email_status[]", e.trim());
  }
  if (typeof filters.include_similar_titles === "boolean")
    params.append("include_similar_titles", String(filters.include_similar_titles));
  params.append("page", String(filters.page ?? 1));
  params.append("per_page", String(Math.min(100, Math.max(1, filters.per_page ?? 50))));

  const url = `${APOLLO_BASE_URL}/mixed_people/api_search?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    signal: init?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApolloApiError(
      `Apollo search failed: ${res.status} ${res.statusText}`,
      res.status,
      tryParseJson(text),
    );
  }

  const data = (await res.json()) as {
    people?: unknown[];
    pagination?: {
      page?: number;
      per_page?: number;
      total_entries?: number;
      total_pages?: number;
    };
  };

  const people = Array.isArray(data.people)
    ? data.people.map(normalizeSearchPerson).filter((p): p is ApolloSearchResultPerson => p !== null)
    : [];

  return {
    people,
    pagination: {
      page: data.pagination?.page ?? filters.page ?? 1,
      per_page: data.pagination?.per_page ?? filters.per_page ?? 50,
      total_entries: data.pagination?.total_entries ?? people.length,
      total_pages: data.pagination?.total_pages ?? 1,
    },
  };
}

function normalizeSearchPerson(raw: unknown): ApolloSearchResultPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  const org = r.organization as Record<string, unknown> | null | undefined;
  return {
    id,
    first_name: typeof r.first_name === "string" ? r.first_name : null,
    last_name_obfuscated:
      typeof r.last_name_obfuscated === "string"
        ? r.last_name_obfuscated
        : typeof r.last_name === "string"
          ? r.last_name
          : null,
    title: typeof r.title === "string" ? r.title : null,
    has_email: r.has_email === true,
    has_direct_phone:
      r.has_direct_phone === true ||
      (typeof r.has_direct_phone === "string" && r.has_direct_phone.toLowerCase() === "yes"),
    organization: org
      ? {
          id: typeof org.id === "string" ? org.id : null,
          name: typeof org.name === "string" ? org.name : null,
          industry: typeof org.industry === "string" ? org.industry : null,
          has_industry: org.has_industry === true,
          has_employee_count: org.has_employee_count === true,
          has_revenue: org.has_revenue === true,
        }
      : null,
  };
}

// =========================================================================
// Bulk Enrichment
// =========================================================================

export type ApolloEnrichedPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  email_status: string | null;
  title: string | null;
  headline: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  organization: {
    id: string | null;
    name: string | null;
    website_url: string | null;
    primary_domain: string | null;
    industry: string | null;
    estimated_num_employees: number | null;
    annual_revenue: number | null;
    short_description: string | null;
    primary_phone: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    founded_year: number | null;
    technologies: string[];
    keywords: string[];
  } | null;
};

export type BulkMatchResult = {
  matched: ApolloEnrichedPerson[];
  /** IDs, fuer die KEIN match zurueckkam (nicht in der Apollo-DB / Datenschutz). */
  unmatched_ids: string[];
  /** Geschaetzte Credit-Kosten (1 pro matched). */
  credits_used: number;
};

/**
 * Bulk People Enrichment — kostet ~1 Credit pro Match (max. 10 IDs/Call).
 * Gibt echte Emails (wenn nicht GDPR-blockiert), LinkedIn-URLs, Org-Details.
 *
 * Pflicht-Hinweis: `reveal_personal_emails: true` enthuellt PERSONAL emails
 * (z.B. gmail), `false` enthuellt nur business emails. Default false.
 */
export async function bulkMatchPeople(
  ids: string[],
  opts?: {
    reveal_personal_emails?: boolean;
    signal?: AbortSignal;
  },
): Promise<BulkMatchResult> {
  if (ids.length === 0) return { matched: [], unmatched_ids: [], credits_used: 0 };
  if (ids.length > 10) {
    throw new Error("bulkMatchPeople: Apollo limit is 10 IDs per call.");
  }
  const apiKey = getApolloApiKey();

  const body = {
    details: ids.map((id) => ({ id })),
    reveal_personal_emails: opts?.reveal_personal_emails === true,
  };

  const url = `${APOLLO_BASE_URL}/people/bulk_match`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new ApolloApiError(
      `Apollo bulk_match failed: ${res.status} ${res.statusText}`,
      res.status,
      tryParseJson(text),
    );
  }

  const data = (await res.json()) as {
    matches?: unknown[];
    missing_records?: unknown;
  };

  const matched = Array.isArray(data.matches)
    ? data.matches.map(normalizeEnrichedPerson).filter((p): p is ApolloEnrichedPerson => p !== null)
    : [];

  const unmatched_ids = ids.filter((id) => !matched.some((m) => m.id === id));

  return {
    matched,
    unmatched_ids,
    credits_used: matched.filter((m) => typeof m.email === "string" && m.email.length > 0).length,
  };
}

function normalizeEnrichedPerson(raw: unknown): ApolloEnrichedPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  if (!id) return null;
  const org = r.organization as Record<string, unknown> | null | undefined;
  const techList = Array.isArray((org as Record<string, unknown> | null)?.["technology_names"])
    ? ((org as Record<string, unknown>)["technology_names"] as unknown[])
    : Array.isArray((org as Record<string, unknown> | null)?.["technologies"])
      ? ((org as Record<string, unknown>)["technologies"] as unknown[])
      : [];
  const kwList = Array.isArray((org as Record<string, unknown> | null)?.["keywords"])
    ? ((org as Record<string, unknown>)["keywords"] as unknown[])
    : [];

  return {
    id,
    first_name: typeof r.first_name === "string" ? r.first_name : null,
    last_name: typeof r.last_name === "string" ? r.last_name : null,
    name: typeof r.name === "string" ? r.name : null,
    email: typeof r.email === "string" && r.email.includes("@") ? r.email : null,
    email_status: typeof r.email_status === "string" ? r.email_status : null,
    title: typeof r.title === "string" ? r.title : null,
    headline: typeof r.headline === "string" ? r.headline : null,
    seniority: typeof r.seniority === "string" ? r.seniority : null,
    linkedin_url: typeof r.linkedin_url === "string" ? r.linkedin_url : null,
    twitter_url: typeof r.twitter_url === "string" ? r.twitter_url : null,
    city: typeof r.city === "string" ? r.city : null,
    state: typeof r.state === "string" ? r.state : null,
    country: typeof r.country === "string" ? r.country : null,
    organization: org
      ? {
          id: typeof org.id === "string" ? org.id : null,
          name: typeof org.name === "string" ? org.name : null,
          website_url: typeof org.website_url === "string" ? org.website_url : null,
          primary_domain: typeof org.primary_domain === "string" ? org.primary_domain : null,
          industry: typeof org.industry === "string" ? org.industry : null,
          estimated_num_employees:
            typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
          annual_revenue: typeof org.annual_revenue === "number" ? org.annual_revenue : null,
          short_description:
            typeof org.short_description === "string" ? org.short_description : null,
          primary_phone:
            typeof org.primary_phone === "string"
              ? org.primary_phone
              : typeof (org.primary_phone as Record<string, unknown> | undefined)?.number === "string"
                ? ((org.primary_phone as Record<string, unknown>).number as string)
                : null,
          city: typeof org.city === "string" ? org.city : null,
          state: typeof org.state === "string" ? org.state : null,
          country: typeof org.country === "string" ? org.country : null,
          founded_year: typeof org.founded_year === "number" ? org.founded_year : null,
          technologies: techList
            .filter((t): t is string => typeof t === "string")
            .slice(0, 30),
          keywords: kwList.filter((k): k is string => typeof k === "string").slice(0, 20),
        }
      : null,
  };
}

function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// =========================================================================
// Helpers fuer Discovery (kein API-Call, nur formatting)
// =========================================================================

/** Baut Apollo-konforme employee-range-Strings aus min/max. */
export function buildEmployeeRange(min: number, max: number): string[] {
  const lo = Math.max(1, Math.floor(min));
  const hi = Math.max(lo, Math.floor(max));
  return [`${lo},${hi}`];
}
