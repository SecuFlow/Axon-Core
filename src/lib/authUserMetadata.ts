/**
 * Rollen in auth.users.user_metadata.role (Supabase).
 * - private: Coin-Space, kein Konzern-Dashboard
 * - enterprise: Konzern / Abo-Flow
 * - konzern: Legacy, wie enterprise behandelt
 */

export function getMetadataRole(
  user:
    | {
        user_metadata?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined,
): string {
  const userMetaRole = user?.user_metadata?.role;
  if (typeof userMetaRole === "string") return userMetaRole.trim().toLowerCase();
  const metadataRole = user?.metadata?.role;
  if (typeof metadataRole === "string") return metadataRole.trim().toLowerCase();
  return "";
}

export function isPrivateUserRole(role: string): boolean {
  return role === "private";
}

/** Enterprise-/Konzern-Nutzer (inkl. fehlende Rolle = Legacy-Konzern). */
export function isEnterpriseUserRole(role: string): boolean {
  if (role === "private") return false;
  return role === "enterprise" || role === "konzern" || role === "";
}
