import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfileMandateFields = {
  company_id: string | null;
  tenant_id: string | null;
  mandant_id: string | null;
};

/**
 * Kanonische Mandanten-UUID eines Profils.
 * profiles.company_id (FK companies.id) hat immer Vorrang vor tenant_id/mandant_id.
 */
export function resolveProfileMandantTenantIdFromMaps(
  row: ProfileMandateFields,
  tenantByCompanyPk: Map<string, string>,
  tenantIdsAsLegacyCompanyId?: Set<string>,
): string | null {
  const companyPk =
    typeof row.company_id === "string" && row.company_id.trim().length > 0
      ? row.company_id.trim()
      : null;

  if (companyPk) {
    const fromCompany = tenantByCompanyPk.get(companyPk);
    if (fromCompany) return fromCompany;
    if (tenantIdsAsLegacyCompanyId?.has(companyPk)) return companyPk;
  }

  const mid =
    typeof row.mandant_id === "string" && row.mandant_id.trim().length > 0
      ? row.mandant_id.trim()
      : null;
  if (mid) return mid;

  const tid =
    typeof row.tenant_id === "string" && row.tenant_id.trim().length > 0
      ? row.tenant_id.trim()
      : null;
  return tid;
}

export async function loadTenantByCompanyPkMap(
  service: SupabaseClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data, error } = await service
    .from("companies")
    .select("id, tenant_id, mandant_id")
    .not("tenant_id", "is", null);
  if (error) return map;
  for (const row of data ?? []) {
    const r = row as {
      id?: string;
      tenant_id?: string | null;
      mandant_id?: string | null;
    };
    if (typeof r.id !== "string" || !r.id) continue;
    const tid =
      (typeof r.mandant_id === "string" && r.mandant_id.trim()) ||
      (typeof r.tenant_id === "string" && r.tenant_id.trim()) ||
      "";
    if (tid) map.set(r.id, tid);
  }
  return map;
}

export async function resolveProfileMandantTenantId(
  service: SupabaseClient,
  row: ProfileMandateFields,
  cache?: Map<string, string>,
): Promise<string | null> {
  const companyPk =
    typeof row.company_id === "string" && row.company_id.trim().length > 0
      ? row.company_id.trim()
      : null;

  if (companyPk) {
    const cached = cache?.get(companyPk);
    if (cached) return cached;

    const { data } = await service
      .from("companies")
      .select("tenant_id, mandant_id")
      .eq("id", companyPk)
      .maybeSingle();
    const resolved =
      (typeof (data as { mandant_id?: string | null } | null)?.mandant_id ===
        "string" &&
        (data as { mandant_id: string }).mandant_id.trim()) ||
      (typeof (data as { tenant_id?: string | null } | null)?.tenant_id ===
        "string" &&
        (data as { tenant_id: string }).tenant_id.trim()) ||
      "";
    if (resolved) {
      cache?.set(companyPk, resolved);
      return resolved;
    }
  }

  return resolveProfileMandantTenantIdFromMaps(row, cache ?? new Map());
}
