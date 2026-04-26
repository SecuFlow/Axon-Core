import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Löst `companies.id` (PK) oder `tenant_id` (Mandanten-UUID) zur `tenant_id` auf,
 * die in `locations.company_id` verwendet wird.
 */
export async function resolveMandantTenantId(
  service: SupabaseClient,
  raw: string,
): Promise<string | null> {
  const t = raw.trim();
  if (!t) return null;

  const { data: byPk } = await service
    .from("companies")
    .select("tenant_id")
    .eq("id", t)
    .maybeSingle();

  const tid1 = (byPk as { tenant_id?: string | null } | null)?.tenant_id;
  if (typeof tid1 === "string" && tid1.length > 0) {
    return tid1;
  }

  const { data: byTenant } = await service
    .from("companies")
    .select("tenant_id")
    .eq("tenant_id", t)
    .limit(1)
    .maybeSingle();

  const tid2 = (byTenant as { tenant_id?: string | null } | null)?.tenant_id;
  if (typeof tid2 === "string" && tid2.length > 0) {
    return tid2;
  }

  return null;
}

/**
 * Löst `profiles.company_id` oder eine tenant-UUID zur `companies.id` (PK) auf
 * — z. B. für Admin-Dropdowns.
 */
export async function resolveCompanyRowId(
  service: SupabaseClient,
  raw: string,
): Promise<string | null> {
  const t = raw.trim();
  if (!t) return null;

  const { data: byPk } = await service
    .from("companies")
    .select("id")
    .eq("id", t)
    .maybeSingle();

  const id1 = (byPk as { id?: string } | null)?.id;
  if (typeof id1 === "string" && id1.length > 0) {
    return id1;
  }

  const { data: byTenant } = await service
    .from("companies")
    .select("id")
    .eq("tenant_id", t)
    .limit(1)
    .maybeSingle();

  const id2 = (byTenant as { id?: string } | null)?.id;
  if (typeof id2 === "string" && id2.length > 0) {
    return id2;
  }

  return null;
}
