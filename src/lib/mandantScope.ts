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
 * Reihenfolge: profiles.mandant_id -> profiles.tenant_id -> profiles.company_id -> companies.mandant_id -> companies.tenant_id
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

  if (!profileRes.error && profileRes.data) {
    const row = profileRes.data as {
      mandant_id?: unknown;
      tenant_id?: unknown;
      company_id?: unknown;
    };
    const fromProfile =
      (typeof row.mandant_id === "string" && row.mandant_id.trim()) ||
      (typeof row.tenant_id === "string" && row.tenant_id.trim()) ||
      (typeof row.company_id === "string" && row.company_id.trim()) ||
      "";
    if (fromProfile) return fromProfile;
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
