import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDbRole } from "@/lib/adminAccess";

/**
 * Plattform-Admin laut public.profiles.role (profiles.id = Auth-UUID).
 */
export async function fetchProfileIsPlatformAdmin(
  db: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  return normalizeDbRole((data as { role?: unknown }).role) === "admin";
}
