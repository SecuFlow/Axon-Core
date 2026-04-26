import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { toClientBrandingPayload } from "@/lib/brandingDisplay";
import { loadCompanyBranding } from "@/lib/companyBranding.server";
import { getDefaultDemoSlug } from "@/lib/defaultDemoSlug.server";
import { resolveDemoCompanyByParam } from "@/lib/resolveDemoCompanyByParam.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

/**
 * Öffentliches Branding:
 * - Ohne `demo`: wie bisher (eingeloggter User via Cookie).
 * - Mit `?demo=<slug|uuid|domain|true>`: Gast-Demo, Service Role, keine Cookies nötig.
 *   Unbekannter Slug → neue Firma (`AXON_DEMO_DEFAULT_PRIMARY`) + 3 Beispiel-Maschinen
 *   (siehe `resolveDemoCompanyByParam` / `ensureDemoSeedMachinesIfEmpty`).
 *   `allowInactiveDemo`: liefert Branding, sobald die Firma existiert (inkl. Auto-Create für neue Slugs).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const demoRaw = (url.searchParams.get("demo") ?? "").trim();

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (demoRaw && serviceRoleKey && supabaseUrl) {
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let key = demoRaw;
    if (key.toLowerCase() === "true") {
      const resolved = await getDefaultDemoSlug(service);
      if (!resolved) {
        return NextResponse.json(
          {
            logo_url: null,
            primary_color: null,
            brand_name: null,
            show_cta: false,
            error: "Kein Standard-Demo-Slug. Setze AXON_DEMO_DEFAULT_SLUG oder eine aktive Demo-Firma mit demo_slug.",
          },
          { status: 404 },
        );
      }
      key = resolved;
    }

    const resolved = await resolveDemoCompanyByParam(service, key, {
      allowInactiveDemo: true,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        {
          logo_url: null,
          primary_color: null,
          brand_name: null,
          show_cta: false,
          error: resolved.message,
        },
        { status: resolved.status },
      );
    }

    const r = resolved.row;
    const brandName =
      (typeof r.brand_name === "string" && r.brand_name.trim()
        ? r.brand_name.trim()
        : null) ??
      (typeof r.name === "string" && r.name.trim() ? r.name.trim() : null) ??
      null;

    const payload = toClientBrandingPayload({
      logo_url:
        typeof r.logo_url === "string" && r.logo_url.trim() ? r.logo_url.trim() : null,
      primary_color:
        typeof r.primary_color === "string" && r.primary_color.trim()
          ? r.primary_color.trim()
          : null,
      show_cta: r.show_cta === true,
    });
    return NextResponse.json(
      {
        ...payload,
        brand_name: brandName,
        name: brandName,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    const payload = toClientBrandingPayload({});
    return NextResponse.json(
      { ...payload, brand_name: null, name: null, show_cta: false },
      { status: 200 },
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
    const payload = toClientBrandingPayload({});
    return NextResponse.json(
      { ...payload, brand_name: null, name: null, show_cta: false },
      { status: 200 },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const b = await loadCompanyBranding(service, user.id);
  const payload = toClientBrandingPayload({
    logo_url: b.logo_url,
    primary_color: b.primary_color,
    show_cta: false,
  });

  return NextResponse.json(
    {
      ...payload,
      brand_name: b.brand_name,
      name: b.brand_name,
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
