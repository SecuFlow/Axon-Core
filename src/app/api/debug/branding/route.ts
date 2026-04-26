import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadCompanyBranding } from "@/lib/companyBranding.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

type CompanyRow = {
  id?: string;
  user_id?: string;
  tenant_id?: string | null;
  name?: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  role?: unknown;
};

function hasBranding(r: CompanyRow | null | undefined): boolean {
  if (!r) return false;
  return (
    (typeof r.logo_url === "string" && r.logo_url.trim().length > 0) ||
    (typeof r.primary_color === "string" && r.primary_color.trim().length > 0) ||
    (typeof r.brand_name === "string" && r.brand_name.trim().length > 0)
  );
}

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const hasAccessToken = typeof accessToken === "string" && accessToken.length > 0;
  const hasSupabaseUrl = typeof supabaseUrl === "string" && supabaseUrl.length > 0;
  const hasAnonKey = typeof supabaseAnonKey === "string" && supabaseAnonKey.length > 0;
  const hasServiceRole = typeof serviceRoleKey === "string" && serviceRoleKey.length > 0;

  if (!hasSupabaseUrl || !hasAnonKey || !hasServiceRole) {
    return NextResponse.json(
      {
        ok: false,
        error: "Server-Konfiguration fehlt.",
        config: {
          hasAccessToken,
          hasSupabaseUrl,
          hasAnonKey,
          hasServiceRole,
        },
      },
      { status: 503 },
    );
  }

  if (!hasAccessToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Nicht angemeldet (sb-access-token Cookie fehlt). Öffne den Endpoint im selben Browser, in dem du eingeloggt bist.",
        config: {
          hasAccessToken,
          hasSupabaseUrl,
          hasAnonKey,
          hasServiceRole,
        },
      },
      { status: 401 },
    );
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sitzung ungültig (Token wird nicht akzeptiert).",
        config: {
          hasAccessToken,
          hasSupabaseUrl,
          hasAnonKey,
          hasServiceRole,
        },
      },
      { status: 401 },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Raw-Profile + Join
  const { data: profJoin } = await service
    .from("profiles")
    .select("id, company_id, tenant_id, companies(*)")
    .eq("id", user.id)
    .maybeSingle();

  const p = (profJoin ?? null) as
    | {
        id?: string;
        company_id?: string | null;
        tenant_id?: string | null;
        companies?: CompanyRow | CompanyRow[] | null;
      }
    | null;

  const joinedRaw = p?.companies ?? null;
  const joinedCompany = Array.isArray(joinedRaw)
    ? (joinedRaw[0] as CompanyRow | undefined)
    : (joinedRaw as CompanyRow | null);

  // 2) companies per user_id
  const { data: owned } = await service
    .from("companies")
    .select("id, user_id, tenant_id, name, brand_name, logo_url, primary_color, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const ownedRow = (owned ?? null) as CompanyRow | null;

  // 3) companies by profile.company_id (falls gesetzt)
  const profileCompanyId =
    typeof p?.company_id === "string" && p.company_id.trim() ? p.company_id.trim() : null;
  const { data: byProfileCompany } = profileCompanyId
    ? await service
        .from("companies")
        .select("id, user_id, tenant_id, name, brand_name, logo_url, primary_color, role")
        .eq("id", profileCompanyId)
        .maybeSingle()
    : { data: null };
  const byProfileCompanyRow = (byProfileCompany ?? null) as CompanyRow | null;

  // 4) companies by tenant_id (falls vorhanden)
  const tenantId =
    (typeof p?.tenant_id === "string" && p.tenant_id.trim()
      ? p.tenant_id.trim()
      : typeof ownedRow?.tenant_id === "string" && ownedRow.tenant_id.trim()
        ? ownedRow.tenant_id.trim()
        : null) ?? null;

  const { data: tenantCompanies } = tenantId
    ? await service
        .from("companies")
        .select("id, user_id, tenant_id, name, brand_name, logo_url, primary_color, role")
        .eq("tenant_id", tenantId)
        .limit(25)
    : { data: null };

  const tenantRows = (tenantCompanies ?? []) as CompanyRow[];
  const tenantBrandingCandidate =
    tenantRows.find((r) => hasBranding(r)) ?? null;

  // 5) Final computed branding (gleiche Funktion wie App)
  const computed = await loadCompanyBranding(service, user.id);

  // Heuristik: welcher Pfad hat sehr wahrscheinlich getroffen?
  let likelySource: string = "empty";
  if (joinedCompany) likelySource = "profiles.join (profiles.company_id -> companies)";
  else if (ownedRow && hasBranding(ownedRow)) likelySource = "companies by user_id (has branding)";
  else if (profileCompanyId && byProfileCompanyRow)
    likelySource = "companies by profiles.company_id (direct)";
  else if (tenantBrandingCandidate)
    likelySource = "companies by tenant_id (first row with branding)";
  else if (ownedRow) likelySource = "companies by user_id (no branding)";

  return NextResponse.json(
    {
      user_id: user.id,
      profile: {
        company_id: profileCompanyId,
        tenant_id: typeof p?.tenant_id === "string" ? p.tenant_id : null,
      },
      joined_company: joinedCompany
        ? {
            id: joinedCompany.id ?? null,
            user_id: joinedCompany.user_id ?? null,
            tenant_id: joinedCompany.tenant_id ?? null,
            name: joinedCompany.name ?? null,
            brand_name: joinedCompany.brand_name ?? null,
            logo_url: joinedCompany.logo_url ?? null,
            primary_color: joinedCompany.primary_color ?? null,
            role: joinedCompany.role ?? null,
          }
        : null,
      companies_by_user_id: ownedRow
        ? {
            id: ownedRow.id ?? null,
            user_id: ownedRow.user_id ?? null,
            tenant_id: ownedRow.tenant_id ?? null,
            name: ownedRow.name ?? null,
            brand_name: ownedRow.brand_name ?? null,
            logo_url: ownedRow.logo_url ?? null,
            primary_color: ownedRow.primary_color ?? null,
            role: ownedRow.role ?? null,
          }
        : null,
      companies_by_tenant_id_sample: tenantRows.slice(0, 10).map((r) => ({
        id: r.id ?? null,
        user_id: r.user_id ?? null,
        tenant_id: r.tenant_id ?? null,
        name: r.name ?? null,
        brand_name: r.brand_name ?? null,
        logo_url: r.logo_url ?? null,
        primary_color: r.primary_color ?? null,
        role: r.role ?? null,
        has_branding: hasBranding(r),
      })),
      tenant_branding_candidate: tenantBrandingCandidate
        ? {
            id: tenantBrandingCandidate.id ?? null,
            user_id: tenantBrandingCandidate.user_id ?? null,
            name: tenantBrandingCandidate.name ?? null,
            brand_name: tenantBrandingCandidate.brand_name ?? null,
            logo_url: tenantBrandingCandidate.logo_url ?? null,
            primary_color: tenantBrandingCandidate.primary_color ?? null,
          }
        : null,
      computed_branding: computed,
      likely_source: likelySource,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}

