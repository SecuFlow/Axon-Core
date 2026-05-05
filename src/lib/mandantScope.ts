import type { SupabaseClient } from "@supabase/supabase-js";

type EqCapableQuery = {
  eq: (column: string, value: string) => EqCapableQuery;
};

/**
 * Globaler Mandanten-Filter fuer Datenabfragen.
 * Nutzt konsequent `mandant_id`.
 */
export function applyMandantFilter<T extends EqCapableQuery>(
  query: T,
  mandantId: string,
): T {
  return query.eq("mandant_id", mandantId.trim()) as T;
}

/**
 * Ermittelt die Mandanten-ID des eingeloggten Users.
 *
 * Reihenfolge (nur echte Mandanten-UUIDs):
 *   1) profiles.mandant_id
 *   2) profiles.tenant_id
 *   3) companies.mandant_id / companies.tenant_id über profiles.company_id (PK)
 *   4) companies.mandant_id / companies.tenant_id über companies.user_id
 *
 * Wichtig: profiles.company_id ist ein FK auf companies.id (PK) und NICHT
 * direkt eine Mandanten-UUID — daher darf der Wert NIE als Mandant zurückgegeben
 * werden, sondern muss erst zu companies.tenant_id resolved werden.
 */
export async function resolveActorMandantId(
  service: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const profileRes = await service
    .from("profiles")
    .select("mandant_id,tenant_id,company_id")
    .eq("id", userId)
    .maybeSingle();

  let companyPkFromProfile: string | null = null;

  if (!profileRes.error && profileRes.data) {
    const row = profileRes.data as {
      mandant_id?: unknown;
      tenant_id?: unknown;
      company_id?: unknown;
    };

    const directMandant =
      (typeof row.mandant_id === "string" && row.mandant_id.trim()) ||
      (typeof row.tenant_id === "string" && row.tenant_id.trim()) ||
      "";
    if (directMandant) return directMandant;

    if (typeof row.company_id === "string" && row.company_id.trim()) {
      companyPkFromProfile = row.company_id.trim();
    }
  }

  if (companyPkFromProfile) {
    const viaCompanyPk = await service
      .from("companies")
      .select("mandant_id,tenant_id")
      .eq("id", companyPkFromProfile)
      .maybeSingle();
    if (!viaCompanyPk.error && viaCompanyPk.data) {
      const r = viaCompanyPk.data as {
        mandant_id?: unknown;
        tenant_id?: unknown;
      };
      const resolved =
        (typeof r.mandant_id === "string" && r.mandant_id.trim()) ||
        (typeof r.tenant_id === "string" && r.tenant_id.trim()) ||
        "";
      if (resolved) return resolved;
    }
  }

  const companyRes = await service
    .from("companies")
    .select("mandant_id,tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (companyRes.error || !companyRes.data) return null;

  const companyRow = companyRes.data as {
    mandant_id?: unknown;
    tenant_id?: unknown;
  };
  return (
    (typeof companyRow.mandant_id === "string" && companyRow.mandant_id.trim()) ||
    (typeof companyRow.tenant_id === "string" && companyRow.tenant_id.trim()) ||
    null
  );
}
