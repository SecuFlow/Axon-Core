import type { SupabaseClient } from "@supabase/supabase-js";

type OrCapableQuery = {
  or: (filters: string) => OrCapableQuery;
};

export function buildAiCasesMandantOrFilter(
  mandantTenantId: string,
  companyPks: string[],
): string {
  const tid = mandantTenantId.trim();
  const parts = new Set<string>([
    `mandant_id.eq.${tid}`,
    `tenant_id.eq.${tid}`,
    `company_id.eq.${tid}`,
  ]);
  for (const pk of companyPks) {
    if (pk) {
      parts.add(`mandant_id.eq.${pk}`);
      parts.add(`company_id.eq.${pk}`);
    }
  }
  return [...parts].join(",");
}

export async function loadCompanyPksForMandant(
  service: SupabaseClient,
  mandantTenantId: string,
): Promise<string[]> {
  const tid = mandantTenantId.trim();
  if (!tid) return [];
  const { data: companies } = await service
    .from("companies")
    .select("id")
    .eq("tenant_id", tid);
  return (companies ?? [])
    .map((row) => (row as { id?: string }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Filtert ai_cases für einen Mandanten inkl. Legacy-Fehler:
 * - mandant_id/tenant_id = Mandanten-UUID
 * - mandant_id/company_id = companies.id (PK) dieses Mandanten
 */
export function applyAiCasesMandantScope<T extends OrCapableQuery>(
  query: T,
  mandantTenantId: string,
  companyPks: string[],
): T {
  const filter = buildAiCasesMandantOrFilter(mandantTenantId, companyPks);
  if (!filter) return query;
  return query.or(filter) as T;
}
