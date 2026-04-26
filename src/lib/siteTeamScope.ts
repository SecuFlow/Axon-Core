import type { SupabaseClient } from "@supabase/supabase-js";
import { isJwtOrMetadataAdmin } from "@/lib/adminAccess";
import { fetchProfileIsPlatformAdmin } from "@/lib/profilePlatformAdmin";
import { resolveActorMandantId } from "@/lib/mandantScope";
import { AXON_SITE_TEAM_MANDANT_ID } from "@/lib/siteTeamMandant";

async function isJwtMetadataPlatformAdmin(
  service: SupabaseClient,
  actorId: string,
): Promise<boolean> {
  const { data, error } = await service.auth.admin.getUserById(actorId);
  if (error || !data?.user) return false;
  return isJwtOrMetadataAdmin(data.user);
}

/**
 * HQ / Plattform: feste Mandanten-ID für öffentliches Website-Team.
 * Konzern-Manager: eigene mandant_id.
 */
export async function resolvePublicTeamScopeMandant(
  service: SupabaseClient,
  actorId: string,
): Promise<{ scopeMandant: string; isPlatform: boolean } | null> {
  const mandantId = await resolveActorMandantId(service, actorId);
  const isPlatform =
    (await fetchProfileIsPlatformAdmin(service, actorId)) ||
    (await isJwtMetadataPlatformAdmin(service, actorId));
  if (isPlatform) {
    return { scopeMandant: AXON_SITE_TEAM_MANDANT_ID, isPlatform: true };
  }
  if (mandantId) {
    return { scopeMandant: mandantId, isPlatform: false };
  }
  return null;
}
