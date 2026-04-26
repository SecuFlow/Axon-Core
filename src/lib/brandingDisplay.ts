import {
  DEFAULT_BRAND_PRIMARY,
  normalizePrimaryColor,
} from "@/lib/brandTheme";
import type { ClientBranding } from "@/components/branding/useBranding";

/** Öffentlicher Pfad — gleicher Fallback wie Konzern-Dashboard & Worker. */
export const DEFAULT_LOGO_PUBLIC_PATH = "/default-logo.svg" as const;

/** „Tote“ UI-Farben: leer oder effektiv schwarz. */
export function isInvisiblePrimaryColor(hex: string | null | undefined): boolean {
  if (hex == null || typeof hex !== "string") return true;
  const n = normalizePrimaryColor(hex.trim());
  if (!n) return true;
  const l = n.toLowerCase();
  return l === "#000" || l === "#000000";
}

/**
 * Primärfarbe für UI/API: nie unsichtbar — Axon-Core-Blau als Standard.
 */
export function resolveEffectivePrimaryColor(
  raw: string | null | undefined,
): string {
  const n = normalizePrimaryColor(raw ?? null);
  if (!n || isInvisiblePrimaryColor(n)) return DEFAULT_BRAND_PRIMARY;
  return n;
}

/**
 * Logo-URL für `<img src>`: nie leer (verhindert kaputtes Icon ohne Bild).
 */
export function resolveEffectiveLogoUrl(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s.length > 0 ? s : DEFAULT_LOGO_PUBLIC_PATH;
}

/** API-JSON / Session: konsistente Mandanten-Anzeige. */
export function toClientBrandingPayload(input: {
  logo_url?: string | null;
  primary_color?: string | null;
  show_cta?: boolean | null;
}): ClientBranding & { logo_url: string; primary_color: string } {
  return {
    logo_url: resolveEffectiveLogoUrl(input.logo_url),
    primary_color: resolveEffectivePrimaryColor(input.primary_color),
    show_cta: typeof input.show_cta === "boolean" ? input.show_cta : undefined,
  };
}
