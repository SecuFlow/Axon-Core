import type { SupabaseClient } from "@supabase/supabase-js";

async function getLocationFromProfile(
  service: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const { data: row } = await service
    .from("profiles")
    .select("location_id")
    .eq("id", userId)
    .maybeSingle();

  const raw = (row as { location_id?: string | null } | null)?.location_id;

  if (raw && typeof raw === "string") {
    const { data: locOk } = await service
      .from("locations")
      .select("id")
      .eq("id", raw)
      .eq("company_id", tenantId)
      .maybeSingle();
    if (locOk) return raw;
  }

  return null;
}

/**
 * Standort für neue Maschinen (Sprachsteuerung): Profil → sonst erster Mandanten-Standort.
 */
export async function resolveDefaultLocationIdForUser(
  service: SupabaseClient,
  userId: string,
  tenantId: string,
): Promise<string | null> {
  const fromProfile = await getLocationFromProfile(service, userId, tenantId);
  if (fromProfile) return fromProfile;

  const { data: first } = await service
    .from("locations")
    .select("id")
    .eq("company_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const id = (first as { id?: string } | null)?.id;
  return typeof id === "string" ? id : null;
}
