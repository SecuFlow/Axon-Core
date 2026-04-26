import type { CompanyBranding } from "@/lib/brandTheme";
import { resolveAccentPrimaryColor } from "@/lib/brandTheme";
import { resolveEffectiveLogoUrl } from "@/lib/brandingDisplay";

/** Antwort von `GET /api/profile/me` */
export type ProfileMeResponse = {
  profile: unknown;
  branding: CompanyBranding | null;
};

/**
 * Konzern-Branding (service role, gleiche Logik wie Dashboard) hat Vorrang vor dem
 * reinen Join `profiles.companies` — Worker haben oft eine funktionierende Zuordnung
 * nur über `loadCompanyBranding`-Fallbacks.
 */
export function resolveWorkerBranding(payload: {
  profile?: unknown;
  branding?: CompanyBranding | null;
}): { logo_url: string; primary_color: string } {
  const b = payload.branding;
  const raw = (payload.profile as { companies?: unknown } | null)?.companies;
  const company = Array.isArray(raw) ? raw[0] : raw;
  const c = company as { logo_url?: unknown; primary_color?: unknown } | undefined;
  const logoFromCompany =
    typeof c?.logo_url === "string" && c.logo_url.trim() ? c.logo_url.trim() : null;
  const colorFromCompany =
    typeof c?.primary_color === "string" && c.primary_color.trim()
      ? c.primary_color.trim()
      : null;
  const rawLogo =
    (typeof b?.logo_url === "string" && b.logo_url.trim() ? b.logo_url.trim() : null) ??
    logoFromCompany;
  const rawColor =
    (typeof b?.primary_color === "string" && b.primary_color.trim()
      ? b.primary_color.trim()
      : null) ?? colorFromCompany;
  return {
    logo_url: resolveEffectiveLogoUrl(rawLogo),
    primary_color: resolveAccentPrimaryColor(rawColor ?? null),
  };
}
