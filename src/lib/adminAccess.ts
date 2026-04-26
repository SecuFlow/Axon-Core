/**
 * Gemeinsame Admin-Erkennung für Middleware (Edge) und Server-Layouts.
 * Keine Secrets — nur String-Normalisierung + app_metadata (JWT).
 */

export function normalizeDbRole(role: unknown): string {
  if (role === null || role === undefined) return "";
  return String(role).trim().toLowerCase();
}

/** Schnellster Pfad: nur session.user.app_metadata.role (im Access-JWT). */
export function isAppMetadataAdmin(user: {
  app_metadata?: Record<string, unknown> | null;
}): boolean {
  const raw = user.app_metadata?.role as string | undefined;
  return normalizeDbRole(raw) === "admin";
}

/** auth.users.user_metadata.role === "admin" (z. B. gesetzt neben Konzern-Typ). */
export function isUserMetadataAdmin(user: {
  user_metadata?: Record<string, unknown> | null;
}): boolean {
  const raw = user.user_metadata?.role as string | undefined;
  return normalizeDbRole(raw) === "admin";
}

/** Admin in JWT: app_metadata.role oder user_metadata.role. */
export function isJwtOrMetadataAdmin(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): boolean {
  return isAppMetadataAdmin(user) || isUserMetadataAdmin(user);
}
