/**
 * Zentrale HTTP-Cache-Header-Profile.
 *
 * Hintergrund: viele Routes setzen ad-hoc unterschiedliche Cache-Strings; das
 * sorgt dafür, dass weder der Browser noch Vercel/Next eine konsistente
 * Wiederverwendung machen kann. Diese Profile sind die wenigen, die wir
 * bewusst unterstützen — alles andere ist ein Bug.
 */

/** Mutationen, sensible Reads: nichts darf irgendwo zwischengespeichert werden. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

/**
 * Authentifizierte Reads (Profil, Mandanten-Listen, etc.):
 * Browser darf das Ergebnis sofort wiederverwenden, mit kurzer SWR-Phase.
 * NIEMALS für Endpoints mit Mandanten-übergreifenden Daten verwenden.
 */
export const PRIVATE_SWR_HEADERS = {
  "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
} as const;

/** Etwas länger gecachte private Reads, z. B. Konzern-Stats. */
export const PRIVATE_SWR_LONG_HEADERS = {
  "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
} as const;

/**
 * Public-GET-Endpoints (Marketing/Demo, ohne User-Kontext).
 * s-maxage greift im Vercel/CDN-Edge — daher hier wirklich groß denken.
 */
export const PUBLIC_SWR_HEADERS = {
  "Cache-Control":
    "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
} as const;

/** Lange Public-Reads (Branding, statisches Site-Content): bis zu einer Stunde. */
export const PUBLIC_SWR_LONG_HEADERS = {
  "Cache-Control":
    "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
} as const;
