import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Beim Login: profiles mit tenant_id und company_id (Mandant) anlegen/aktualisieren.
 * Nutzt profiles.id = Auth-UUID. location_id = erster Standort, falls noch leer.
 */
export async function ensureUserProfileOnLogin(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: co, error: cErr } = await service
    .from("companies")
    .select("id, tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (cErr || !co) return;

  const companyPk =
    typeof (co as { id?: string }).id === "string"
      ? (co as { id: string }).id
      : null;
  const tenantId = (co as { tenant_id?: string }).tenant_id;
  if (typeof tenantId !== "string" || !tenantId) return;

  const { data: firstLoc } = await service
    .from("locations")
    .select("id")
    .eq("company_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstLocId = (firstLoc as { id?: string } | null)?.id ?? null;

  const { data: prof } = await service
    .from("profiles")
    .select("id, location_id, company_id")
    .eq("id", userId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (prof) {
    const u = prof as {
      location_id?: string | null;
      company_id?: string | null;
    };
    const patch: Record<string, unknown> = {
      tenant_id: tenantId,
      updated_at: now,
    };
    if (companyPk) {
      patch.company_id = companyPk;
    }
    if (!u.location_id && firstLocId) {
      patch.location_id = firstLocId;
    }
    await service.from("profiles").update(patch).eq("id", userId);
    return;
  }

  const ins = await service.from("profiles").insert({
    id: userId,
    tenant_id: tenantId,
    company_id: companyPk,
    location_id: firstLocId,
    updated_at: now,
  });

  if (ins.error) {
    const patch: Record<string, unknown> = {
      tenant_id: tenantId,
      updated_at: now,
    };
    if (companyPk) patch.company_id = companyPk;
    if (firstLocId) patch.location_id = firstLocId;
    await service.from("profiles").update(patch).eq("id", userId);
  }
}
