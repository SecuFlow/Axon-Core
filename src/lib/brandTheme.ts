/** Axon-Core-Blau: Fallback, wenn DB keine sinnvolle Primärfarbe liefert (inkl. #000). */
export const DEFAULT_BRAND_PRIMARY = "#00D1FF";

export type CompanyBranding = {
  brand_name: string | null;
  /** Immer gültige URL fürs UI (inkl. /default-logo.svg). */
  logo_url: string;
  /** Aufgelöste Akzentfarbe (nie „totes“ Schwarz). */
  primary_color: string;
};

export function normalizePrimaryColor(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(s)) return s;
  return null;
}

/** Kein Firmenname, der wie eine E-Mail aussieht (häufiger Datenfehler). */
export function sanitizeBrandName(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

export function resolveAccentPrimaryColor(raw: string | null | undefined): string {
  const n = normalizePrimaryColor(raw ?? null);
  if (!n) return DEFAULT_BRAND_PRIMARY;
  const l = n.toLowerCase();
  if (l === "#000" || l === "#000000") return DEFAULT_BRAND_PRIMARY;
  return n;
}
