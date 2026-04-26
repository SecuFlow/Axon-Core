import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { CompanyBranding } from "@/lib/brandTheme";
import {
  resolveAccentPrimaryColor,
  sanitizeBrandName,
} from "@/lib/brandTheme";
import { resolveEffectiveLogoUrl } from "@/lib/brandingDisplay";
import { isJwtOrMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

/**
 * Liest `logo_url`, `primary_color` und Anzeigenamen aus `companies`
 * für die Firma des Nutzers (`companies.user_id` oder `profiles.company_id`).
 */
/**
 * `profiles.company_id`, sonst erste Firma mit `companies.user_id`.
 */
export async function getCompanyIdForUser(
  service: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: prof } = await service
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  const cid = (prof as { company_id?: string | null } | null)?.company_id;
  if (typeof cid === "string" && cid.trim()) return cid.trim();

  const { data: owned } = await service
    .from("companies")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const id = (owned as { id?: string } | null)?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export type BrandingScope = {
  tenantId: string;
  companyId: string | null;
  companyDisplayName: string | null;
};

export async function getBrandingScopeForUser(
  service: SupabaseClient,
  userId: string,
): Promise<BrandingScope | null> {
  const { data: prof } = await service
    .from("profiles")
    .select("company_id, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const profileCompanyId =
    (prof as { company_id?: string | null } | null)?.company_id ?? null;
  const profileTenantId =
    (prof as { tenant_id?: string | null } | null)?.tenant_id ?? null;

  const profileTenantNorm =
    typeof profileTenantId === "string" && profileTenantId.trim()
      ? profileTenantId.trim()
      : null;
  const profileCompanyNorm =
    typeof profileCompanyId === "string" && profileCompanyId.trim()
      ? profileCompanyId.trim()
      : null;

  if (profileCompanyNorm) {
    const { data: companyRow } = await service
      .from("companies")
      .select("id, tenant_id, brand_name, name")
      .eq("id", profileCompanyNorm)
      .maybeSingle();

    if (companyRow) {
      const c = companyRow as {
        id?: string | null;
        tenant_id?: string | null;
        brand_name?: string | null;
        name?: string | null;
      };
      const tenantId =
        typeof c.tenant_id === "string" && c.tenant_id.trim()
          ? c.tenant_id.trim()
          : profileTenantNorm;
      if (tenantId) {
        const display =
          (typeof c.brand_name === "string" && c.brand_name.trim()
            ? c.brand_name.trim()
            : null) ??
          (typeof c.name === "string" && c.name.trim() ? c.name.trim() : null) ??
          null;
        return {
          tenantId,
          companyId:
            typeof c.id === "string" && c.id.trim() ? c.id.trim() : profileCompanyNorm,
          companyDisplayName: display,
        };
      }
    }
  }

  if (profileTenantNorm) {
    const { data: tenantCompany } = await service
      .from("companies")
      .select("id, brand_name, name")
      .eq("tenant_id", profileTenantNorm)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const tc = tenantCompany as
      | {
          id?: string | null;
          brand_name?: string | null;
          name?: string | null;
        }
      | null;
    const display =
      (typeof tc?.brand_name === "string" && tc.brand_name.trim()
        ? tc.brand_name.trim()
        : null) ??
      (typeof tc?.name === "string" && tc.name.trim() ? tc.name.trim() : null) ??
      null;
    return {
      tenantId: profileTenantNorm,
      companyId: typeof tc?.id === "string" && tc.id.trim() ? tc.id.trim() : null,
      companyDisplayName: display,
    };
  }

  const { data: owned } = await service
    .from("companies")
    .select("id, tenant_id, brand_name, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const o = owned as
    | {
        id?: string | null;
        tenant_id?: string | null;
        brand_name?: string | null;
        name?: string | null;
      }
    | null;
  const tenantId =
    typeof o?.tenant_id === "string" && o.tenant_id.trim() ? o.tenant_id.trim() : null;
  if (!tenantId) return null;
  const display =
    (typeof o?.brand_name === "string" && o.brand_name.trim()
      ? o.brand_name.trim()
      : null) ??
    (typeof o?.name === "string" && o.name.trim() ? o.name.trim() : null) ??
    null;
  return {
    tenantId,
    companyId: typeof o?.id === "string" && o.id.trim() ? o.id.trim() : null,
    companyDisplayName: display,
  };
}

function companyRowToBranding(r: {
  brand_name?: string | null;
  name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}): CompanyBranding {
  const rawBrand =
    typeof r.brand_name === "string" && r.brand_name.trim()
      ? r.brand_name.trim()
      : null;
  const rawName =
    typeof r.name === "string" && r.name.trim() ? r.name.trim() : null;
  const displayName = rawBrand ?? rawName;
  return {
    brand_name: sanitizeBrandName(displayName),
    logo_url: resolveEffectiveLogoUrl(
      typeof r.logo_url === "string" && r.logo_url.trim()
        ? r.logo_url.trim()
        : null,
    ),
    primary_color: resolveAccentPrimaryColor(r.primary_color ?? null),
  };
}

function brandingRowToBranding(r: {
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
}): CompanyBranding {
  return {
    brand_name:
      typeof r.brand_name === "string" && r.brand_name.trim()
        ? sanitizeBrandName(r.brand_name.trim())
        : null,
    logo_url: resolveEffectiveLogoUrl(
      typeof r.logo_url === "string" && r.logo_url.trim() ? r.logo_url.trim() : null,
    ),
    primary_color: resolveAccentPrimaryColor(r.primary_color ?? null),
  };
}

export async function loadCompanyBranding(
  service: SupabaseClient,
  userId: string,
): Promise<CompanyBranding> {
  const empty: CompanyBranding = {
    brand_name: null,
    logo_url: resolveEffectiveLogoUrl(null),
    primary_color: resolveAccentPrimaryColor(null),
  };

  const scope = await getBrandingScopeForUser(service, userId);
  if (scope?.tenantId) {
    const brandingRes = await service
      .from("branding")
      .select("brand_name, logo_url, primary_color")
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (!brandingRes.error && brandingRes.data) {
      return brandingRowToBranding(
        brandingRes.data as {
          brand_name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
        },
      );
    }
  }

  // Primärpfad: profiles.company_id -> companies (Join)
  // Gewünschtes Muster: supabase.from('profiles').select('*, companies(*)').eq('id', user.id).single()
  const { data: profJoin } = await service
    .from("profiles")
    .select("*, companies(*)")
    .eq("id", userId)
    .maybeSingle();

  const joinedRaw = (profJoin as { companies?: unknown } | null)?.companies as
    | {
        brand_name?: string | null;
        name?: string | null;
        logo_url?: string | null;
        primary_color?: string | null;
      }
    | { [k: string]: unknown }[]
    | null
    | undefined;

  const joinedCompany: {
    brand_name?: string | null;
    name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  } | null = Array.isArray(joinedRaw)
    ? ((joinedRaw[0] as {
        brand_name?: string | null;
        name?: string | null;
        logo_url?: string | null;
        primary_color?: string | null;
      } | undefined) ?? null)
    : ((joinedRaw as {
        brand_name?: string | null;
        name?: string | null;
        logo_url?: string | null;
        primary_color?: string | null;
      } | null) ?? null);

  if (joinedCompany) {
    return companyRowToBranding(joinedCompany);
  }

  const { data: owned } = await service
    .from("companies")
    .select("brand_name, name, logo_url, primary_color, tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const tenantFromProfile =
    (profJoin as { tenant_id?: unknown } | null)?.tenant_id ?? null;
  const tenantFromOwned = (owned as { tenant_id?: unknown } | null)?.tenant_id ?? null;
  const tenantId =
    typeof tenantFromProfile === "string" && tenantFromProfile.trim()
      ? tenantFromProfile.trim()
      : typeof tenantFromOwned === "string" && tenantFromOwned.trim()
        ? tenantFromOwned.trim()
        : null;

  if (owned) {
    const r = owned as {
      brand_name?: string | null;
      name?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
      tenant_id?: string | null;
    };

    const hasBranding =
      (typeof r.logo_url === "string" && r.logo_url.trim().length > 0) ||
      (typeof r.primary_color === "string" && r.primary_color.trim().length > 0) ||
      (typeof r.brand_name === "string" && r.brand_name.trim().length > 0);

    // Für Mitarbeiter kann `companies(user_id=worker)` nur die Workforce-Rolle tragen,
    // während Branding auf einer anderen companies-Zeile mit gleichem tenant_id liegt.
    if (hasBranding) {
      return companyRowToBranding(r);
    }
  }

  const fallbackId = await getCompanyIdForUser(service, userId);
  if (fallbackId) {
    const { data: byId } = await service
      .from("companies")
      .select("brand_name, name, logo_url, primary_color")
      .eq("id", fallbackId)
      .maybeSingle();
    if (byId) {
      return companyRowToBranding(
        byId as {
          brand_name?: string | null;
          name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
        },
      );
    }
  }

  // Letzter Fallback für Mitarbeiter: Branding über tenant_id auflösen.
  if (tenantId) {
    const { data: tenantRows } = await service
      .from("companies")
      .select("brand_name, name, logo_url, primary_color")
      .eq("tenant_id", tenantId)
      .limit(25);

    for (const row of (tenantRows ?? []) as Array<{
      brand_name?: string | null;
      name?: string | null;
      logo_url?: string | null;
      primary_color?: string | null;
    }>) {
      const hasBranding =
        (typeof row.logo_url === "string" && row.logo_url.trim().length > 0) ||
        (typeof row.primary_color === "string" &&
          row.primary_color.trim().length > 0) ||
        (typeof row.brand_name === "string" && row.brand_name.trim().length > 0);
      if (hasBranding) {
        return companyRowToBranding(row);
      }
    }
  }

  return empty;
}

export async function upsertBrandingForUser(
  service: SupabaseClient,
  userId: string,
  input: {
    primary_color: string;
    logo_url?: string | null;
    brand_name?: string | null;
  },
): Promise<{ ok: true; row: CompanyBranding } | { ok: false; error: string }> {
  const scope = await getBrandingScopeForUser(service, userId);
  if (!scope) {
    return { ok: false, error: "Kein Mandant für Nutzer gefunden." };
  }

  const payload: Record<string, unknown> = {
    tenant_id: scope.tenantId,
    company_id: scope.companyId,
    updated_by: userId,
    primary_color: input.primary_color,
  };
  if (input.logo_url !== undefined) payload.logo_url = input.logo_url;
  if (input.brand_name !== undefined) payload.brand_name = input.brand_name;

  const upsertRes = await service
    .from("branding")
    .upsert(payload, { onConflict: "tenant_id" })
    .select("brand_name, logo_url, primary_color")
    .single();

  if (upsertRes.error || !upsertRes.data) {
    return {
      ok: false,
      error: upsertRes.error?.message ?? "Branding konnte nicht gespeichert werden.",
    };
  }

  return {
    ok: true,
    row: brandingRowToBranding(
      upsertRes.data as {
        brand_name?: string | null;
        logo_url?: string | null;
        primary_color?: string | null;
      },
    ),
  };
}

/**
 * Server-only: Branding für den aktuellen Request (Cookie-Session).
 */
export async function getCompanyBrandingForUser(): Promise<CompanyBranding> {
  const empty: CompanyBranding = {
    brand_name: null,
    logo_url: resolveEffectiveLogoUrl(null),
    primary_color: resolveAccentPrimaryColor(null),
  };

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return empty;
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) return empty;

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return loadCompanyBranding(service, user.id);
}

/**
 * Server-only: `profiles.role` für die aktuelle Session (kleingeschrieben).
 */
export async function getProfileRoleForDashboardUser(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return null;
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) return null;

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: prof } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const raw = (prof as { role?: unknown } | null)?.role;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().toLowerCase();
}

/**
 * Branding-UI: darf der Nutzer Logo/Farbe bearbeiten und den Menüpunkt sehen?
 * Wichtig: Ohne `profiles.company_id` liefert `company:companies(role)` oft nichts —
 * dann muss `companies.user_id` (Workforce-/Inhaber-Zeile) mit einbezogen werden.
 */
export async function canManageCompanyBranding(
  service: SupabaseClient,
  user: User,
): Promise<boolean> {
  if (isJwtOrMetadataAdmin(user)) return true;

  const { data: profRow } = await service
    .from("profiles")
    .select("role, company_id, company:companies(role)")
    .eq("id", user.id)
    .maybeSingle();

  const p = profRow as {
    role?: unknown;
    company_id?: string | null;
    company?: { role?: unknown } | null;
  } | null;

  const pr = normalizeDbRole(p?.role);
  if (pr === "admin" || pr === "manager") return true;

  const embedCr = normalizeDbRole(p?.company?.role);
  if (embedCr === "admin" || embedCr === "manager") return true;

  const { data: ownCo } = await service
    .from("companies")
    .select("role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const ownCr = normalizeDbRole((ownCo as { role?: unknown } | null)?.role);
  if (ownCr === "admin" || ownCr === "manager") return true;

  const profileCid =
    typeof p?.company_id === "string" && p.company_id.trim()
      ? p.company_id.trim()
      : null;

  /**
   * Registrierung legt oft `companies.role = user` an; Inhaber haben dann keinen
   * Manager/Admin-Status, aber noch kein gesetztes `profiles.company_id`.
   */
  if (ownCr === "user" && !profileCid) return true;

  return false;
}

/** @deprecated Name — nutze `getCanManageBrandingForDashboardUser`. */
export async function getIsAdminForDashboardUser(): Promise<boolean> {
  return getCanManageBrandingForDashboardUser();
}

export async function getCanManageBrandingForDashboardUser(): Promise<boolean> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return false;
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) return false;

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return canManageCompanyBranding(service, user);
}
