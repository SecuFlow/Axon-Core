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
    .select("role, tenant_id, mandant_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  const row = data as {
    role?: unknown;
    tenant_id?: string | null;
    mandant_id?: string | null;
  };
  const roleNorm = normalizeDbRole(row.role);
  if (roleNorm !== "admin") return false;
  // Tenant-Admins (Konzern) haben i. d. R. tenant_id/mandant_id gesetzt.
  // Plattform-Admins sind mandantenlos (tenant_id/mandant_id leer) und dürfen global sehen.
  const hasTenant =
    (typeof row.mandant_id === "string" && row.mandant_id.trim().length > 0) ||
    (typeof row.tenant_id === "string" && row.tenant_id.trim().length > 0);
  return !hasTenant;
}
