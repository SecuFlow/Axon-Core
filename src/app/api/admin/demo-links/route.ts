import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { resolveDemoCompanyByParam } from "@/lib/resolveDemoCompanyByParam.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenValue(): string {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

function shortId(raw: string): string {
  return raw.replaceAll("-", "").slice(0, 8);
}

function baseUrlFromRequest(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`.replace(/\/$/, "");
}

type Body = {
  company_id?: string;
  expires_hours?: number;
};

export async function POST(req: Request) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const companyId = (body.company_id ?? "").trim();
  if (!companyId) {
    return NextResponse.json({ error: "company_id fehlt." }, { status: 400 });
  }
  const hours = Number.isFinite(body.expires_hours) ? Number(body.expires_hours) : 24;
  const expiresHours = Math.max(1, Math.min(72, Math.trunc(hours || 24)));

  const cRes = await ctx.service
    .from("companies")
    .select("id,name,brand_name,logo_url,primary_color")
    .eq("id", companyId)
    .maybeSingle();
  if (cRes.error || !cRes.data) {
    return NextResponse.json({ error: cRes.error?.message ?? "Firma nicht gefunden." }, { status: 404 });
  }
  const company = cRes.data as {
    id: string;
    name?: string | null;
    brand_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
  };

  // Immer isolierte Demo-Umgebung mit Beispieldaten (keine echten Mandantendaten).
  const slug = `temp-${shortId(company.id)}-${Date.now().toString(36)}`;
  const demoScope = await resolveDemoCompanyByParam(ctx.service, slug, {
    allowInactiveDemo: true,
  });
  if (!demoScope.ok) {
    return NextResponse.json({ error: demoScope.message }, { status: demoScope.status });
  }
  const demoCompanyId = demoScope.companyId;

  // Branding vom Originalmandanten auf Demo-Kopie übernehmen.
  await ctx.service
    .from("companies")
    .update({
      brand_name:
        (typeof company.brand_name === "string" && company.brand_name.trim()) ||
        (typeof company.name === "string" && company.name.trim()) ||
        null,
      logo_url:
        typeof company.logo_url === "string" && company.logo_url.trim()
          ? company.logo_url.trim()
          : null,
      primary_color:
        typeof company.primary_color === "string" && company.primary_color.trim()
          ? company.primary_color.trim()
          : null,
      is_demo_active: true,
      show_cta: true,
    })
    .eq("id", demoCompanyId);

  const token = tokenValue();
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString();
  const ins = await ctx.service
    .from("demo_access_links")
    .insert({
      created_by: ctx.actorId,
      company_id: demoCompanyId,
      demo_slug: slug,
      token,
      expires_at: expiresAt,
    })
    .select("token,expires_at")
    .single();
  if (ins.error || !ins.data) {
    return NextResponse.json(
      { error: ins.error?.message ?? "Temporärer Demo-Link konnte nicht erstellt werden." },
      { status: 500 },
    );
  }

  const link = `${baseUrlFromRequest(req)}/api/public/demo-access/${encodeURIComponent(token)}`;
  return NextResponse.json({
    ok: true,
    token,
    expires_at: expiresAt,
    demo_link: link,
    dashboard_preview: `${baseUrlFromRequest(req)}/dashboard/konzern?demo=${encodeURIComponent(slug)}`,
  });
}
