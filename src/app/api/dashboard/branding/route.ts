import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canManageCompanyBranding,
  getBrandingScopeForUser,
  loadCompanyBranding,
  upsertBrandingForUser,
} from "@/lib/companyBranding.server";
import { normalizePrimaryColor, sanitizeBrandName } from "@/lib/brandTheme";
import { isJwtOrMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";
import { resolveDemoGuestContextFromRequest } from "@/lib/demoGuestContext.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const emptyBranding = () =>
    NextResponse.json({
      brand_name: null,
      name: null,
      logo_url: null,
      primary_color: null,
      profile_role: null as string | null,
      is_admin: false,
      can_manage_branding: false,
      show_cta: false,
    });

  const url = new URL(request.url);
  if (url.searchParams.has("demo")) {
    const demo = await resolveDemoGuestContextFromRequest(request);
    if (!demo.ok) {
      return NextResponse.json(
        {
          brand_name: null,
          name: null,
          logo_url: null,
          primary_color: null,
          profile_role: null as string | null,
          is_admin: false,
          can_manage_branding: false,
          show_cta: false,
          error: demo.error,
        },
        { status: demo.status },
      );
    }

    let rowRes = await demo.service
      .from("companies")
      .select("brand_name, name, logo_url, primary_color, show_cta")
      .eq("id", demo.companyId)
      .maybeSingle();

    if (rowRes.error?.message?.includes("show_cta")) {
      rowRes = await demo.service
        .from("companies")
        .select("brand_name, name, logo_url, primary_color")
        .eq("id", demo.companyId)
        .maybeSingle();
    }

    const row = rowRes.data;
    const rowErr = rowRes.error;

    if (rowErr) {
      return NextResponse.json(
        {
          brand_name: null,
          name: null,
          logo_url: null,
          primary_color: null,
          profile_role: null as string | null,
          is_admin: false,
          can_manage_branding: false,
          show_cta: false,
          error: rowErr.message,
        },
        { status: 500 },
      );
    }

    const r = row as
      | {
          brand_name?: string | null;
          name?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          show_cta?: boolean | null;
        }
      | null;

    const nameOut =
      (typeof r?.brand_name === "string" && r.brand_name.trim()
        ? r.brand_name.trim()
        : null) ??
      (typeof r?.name === "string" && r.name.trim() ? r.name.trim() : null) ??
      null;

    return NextResponse.json(
      {
        brand_name: nameOut,
        name: nameOut,
        logo_url:
          typeof r?.logo_url === "string" && r.logo_url.trim()
            ? r.logo_url.trim()
            : null,
        primary_color:
          typeof r?.primary_color === "string" && r.primary_color.trim()
            ? r.primary_color.trim()
            : null,
        profile_role: null as string | null,
        is_admin: false,
        can_manage_branding: false,
        show_cta: r?.show_cta === true,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  }

  if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
    return emptyBranding();
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return emptyBranding();
  }

  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
      { status: 503 },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const b = await loadCompanyBranding(service, user.id);
  const can_manage_branding = await canManageCompanyBranding(service, user);

  const { data: profRow } = await service
    .from("profiles")
    .select("role, company:companies(role)")
    .eq("id", user.id)
    .maybeSingle();
  const rawRole = (profRow as { role?: unknown } | null)?.role;
  const profileRoleRaw =
    typeof rawRole === "string" && rawRole.trim() ? rawRole.trim() : null;
  const profileRole = profileRoleRaw ? normalizeDbRole(profileRoleRaw) : null;

  const companyRoleRaw = (profRow as { company?: { role?: unknown } | null } | null)
    ?.company?.role;
  const companyRole = companyRoleRaw ? normalizeDbRole(companyRoleRaw) : null;
  const isAdmin = isJwtOrMetadataAdmin(user) || profileRole === "admin" || companyRole === "admin";

  return NextResponse.json(
    {
      brand_name: b.brand_name,
      name: b.brand_name,
      logo_url: b.logo_url,
      primary_color: b.primary_color,
      profile_role: profileRole,
      is_admin: isAdmin,
      can_manage_branding,
      show_cta: false,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}

type PatchBody = {
  primary_color?: unknown;
  logo_url?: unknown;
  brand_name?: unknown;
};

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const canManage = await canManageCompanyBranding(service, user);
  if (!canManage) {
    return NextResponse.json({ error: "Kein Zugriff auf Branding." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const colorRaw = typeof body.primary_color === "string" ? body.primary_color : "";
  const primaryColor = normalizePrimaryColor(colorRaw);
  if (!primaryColor) {
    return NextResponse.json(
      { error: "primary_color muss eine gültige Hex-Farbe sein." },
      { status: 400 },
    );
  }

  const logoUrl =
    body.logo_url === undefined
      ? undefined
      : typeof body.logo_url === "string" && body.logo_url.trim()
        ? body.logo_url.trim()
        : null;

  const brandName =
    body.brand_name === undefined
      ? undefined
      : sanitizeBrandName(
          typeof body.brand_name === "string" ? body.brand_name.trim() : null,
        );

  const saved = await upsertBrandingForUser(service, user.id, {
    primary_color: primaryColor,
    ...(logoUrl !== undefined ? { logo_url: logoUrl } : {}),
    ...(brandName !== undefined ? { brand_name: brandName } : {}),
  });

  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }

  const scope = await getBrandingScopeForUser(service, user.id);
  return NextResponse.json({
    brand_name: saved.row.brand_name,
    logo_url: saved.row.logo_url,
    primary_color: saved.row.primary_color,
    tenant_id: scope?.tenantId ?? null,
  });
}
