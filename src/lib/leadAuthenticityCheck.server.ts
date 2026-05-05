/**
 * Echtheits-Check fuer Apollo-Leads.
 *
 * Wird VOR dem LLM-Qualifier ausgefuehrt, weil:
 *   - billiger (DNS-Lookups statt OpenAI-Tokens)
 *   - hard rules raussortieren bevor das LLM unnoetig nachdenkt
 *
 * Geprueft wird:
 *   1) Apollo email_status (verified vs. guessed/unverified)
 *   2) Datenvollstaendigkeit (Firma/Person/Branche/Email)
 *   3) Industry-Blacklist (hardcoded Branchen, die nie qualifizieren)
 *   4) Domain-MX-Record (DNS-Lookup; Cache pro Run)
 *
 * Bei Mehrfach-Abrufen derselben Domain wird gecacht (in-memory pro Run).
 */

import { promises as dns } from "node:dns";

import type { ApolloEnrichedPerson } from "@/lib/apolloClient.server";

export type AuthenticityCheckSettings = {
  apollo_blacklist_industries: string[];
  apollo_require_domain_mx: boolean;
  apollo_require_email_verified: boolean;
};

export type AuthenticityCheckResult = {
  ok: boolean;
  // bei !ok: kurzer Reason-Code fuer Logging (engl., snake_case)
  reason?:
    | "no_email"
    | "email_unverified"
    | "no_company_name"
    | "no_manager_name"
    | "no_industry"
    | "blacklisted_industry"
    | "no_domain"
    | "domain_mx_missing"
    | "domain_lookup_error";
  detail?: string;
};

const DOMAIN_MX_CACHE = new Map<string, boolean>();

function normalizeIndustry(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlacklistedIndustry(
  industry: string | null | undefined,
  blacklist: string[],
): boolean {
  if (!industry) return false;
  const norm = normalizeIndustry(industry);
  for (const b of blacklist) {
    const bn = normalizeIndustry(b);
    if (bn && norm.includes(bn)) return true;
  }
  return false;
}

async function hasDomainMx(domain: string): Promise<boolean> {
  const cached = DOMAIN_MX_CACHE.get(domain);
  if (cached !== undefined) return cached;
  try {
    const records = await dns.resolveMx(domain);
    const ok = Array.isArray(records) && records.length > 0;
    DOMAIN_MX_CACHE.set(domain, ok);
    return ok;
  } catch {
    DOMAIN_MX_CACHE.set(domain, false);
    return false;
  }
}

function extractDomain(person: ApolloEnrichedPerson, email: string): string | null {
  const direct =
    person.organization?.primary_domain ??
    (person.organization?.website_url
      ? safeHostname(person.organization.website_url)
      : null);
  if (direct && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(direct)) {
    return direct.replace(/^www\./i, "").toLowerCase();
  }
  // Fallback: Email-Domain
  const at = email.indexOf("@");
  if (at >= 0) {
    const part = email.slice(at + 1).trim().toLowerCase();
    if (part && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(part)) return part;
  }
  return null;
}

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Fuehrt alle Echtheits-Checks aus. Reihenfolge: billig -> teuer.
 */
export async function checkLeadAuthenticity(
  person: ApolloEnrichedPerson,
  settings: AuthenticityCheckSettings,
): Promise<AuthenticityCheckResult> {
  const email = (person.email ?? "").trim();

  if (!email) {
    return { ok: false, reason: "no_email" };
  }

  const emailStatus = person.email_status?.toLowerCase() ?? "";
  if (settings.apollo_require_email_verified && emailStatus !== "verified") {
    return {
      ok: false,
      reason: "email_unverified",
      detail: `apollo email_status="${emailStatus || "unknown"}"`,
    };
  }

  const orgName = person.organization?.name?.trim() ?? "";
  if (!orgName) {
    return { ok: false, reason: "no_company_name" };
  }

  const managerName =
    [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
    person.name ||
    "";
  if (!managerName) {
    return { ok: false, reason: "no_manager_name" };
  }

  const industry = person.organization?.industry?.trim() ?? "";
  if (!industry) {
    // Branche fehlt → koennen weder Industry-Filter noch ICP-Filter sicher
    // anwenden. Lieber raus als Risiko.
    return { ok: false, reason: "no_industry" };
  }

  if (isBlacklistedIndustry(industry, settings.apollo_blacklist_industries)) {
    return {
      ok: false,
      reason: "blacklisted_industry",
      detail: industry,
    };
  }

  if (settings.apollo_require_domain_mx) {
    const domain = extractDomain(person, email);
    if (!domain) {
      return { ok: false, reason: "no_domain" };
    }
    let mxOk: boolean;
    try {
      mxOk = await hasDomainMx(domain);
    } catch (err) {
      return {
        ok: false,
        reason: "domain_lookup_error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    if (!mxOk) {
      return { ok: false, reason: "domain_mx_missing", detail: domain };
    }
  }

  return { ok: true };
}

/**
 * Fuer Tests / Diag: Cache pro Cron-Run zuruecksetzen.
 */
export function resetDomainMxCache(): void {
  DOMAIN_MX_CACHE.clear();
}
