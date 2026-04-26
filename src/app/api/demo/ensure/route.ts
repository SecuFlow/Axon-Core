import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getDefaultDemoSlug } from "@/lib/defaultDemoSlug.server";
import { resolveDemoCompanyByParam } from "@/lib/resolveDemoCompanyByParam.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

/**
 * Legt bei Bedarf eine Demo-Firma für den Slug an und liefert Slug + Company-ID.
 * GET ?slug=…  oder  ?demo=true (Standard-Slug wie /api/demo/resolve)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let slugRaw = (url.searchParams.get("slug") ?? url.searchParams.get("demo") ?? "").trim();

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Server nicht konfiguriert." }, { status: 503 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (slugRaw.toLowerCase() === "true") {
    const s = await getDefaultDemoSlug(service);
    if (!s) {
      return NextResponse.json(
        {
          error:
            "Kein Demo-Slug. Setze AXON_DEMO_DEFAULT_SLUG oder eine aktive Demo-Firma mit demo_slug.",
        },
        { status: 400 },
      );
    }
    slugRaw = s;
  }

  if (!slugRaw) {
    return NextResponse.json({ error: "slug oder demo fehlt." }, { status: 400 });
  }

  const resolved = await resolveDemoCompanyByParam(service, slugRaw, {
    allowInactiveDemo: true,
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }

  const slugOut =
    typeof resolved.row.demo_slug === "string" && resolved.row.demo_slug.trim()
      ? resolved.row.demo_slug.trim().toLowerCase()
      : slugRaw.trim().toLowerCase();

  return NextResponse.json({
    ok: true,
    slug: slugOut || resolved.companyId,
    company_id: resolved.companyId,
  });
}
