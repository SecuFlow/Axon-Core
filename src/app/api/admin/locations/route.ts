import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { resolveMandantTenantId } from "@/lib/resolveMandantTenantId";
import { isRealCompanyOption } from "@/lib/filterRealCompanies";
import { getStripeServer } from "@/lib/stripeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
} as const;

function siteBaseUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const url = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

async function resolveEnterprisePriceId(
  service: import("@supabase/supabase-js").SupabaseClient,
): Promise<string | null> {
  const envDefault = process.env.STRIPE_PRICE_ID?.trim() ?? null;
  const cfg = await service
    .from("pricing_config")
    .select("stripe_price_id,stripe_price_id_enterprise,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = cfg.data as
    | { stripe_price_id?: unknown; stripe_price_id_enterprise?: unknown }
    | null;
  const enterprise =
    typeof row?.stripe_price_id_enterprise === "string"
      ? row.stripe_price_id_enterprise.trim()
      : "";
  const legacy =
    typeof row?.stripe_price_id === "string" ? row.stripe_price_id.trim() : "";
  return enterprise || legacy || envDefault;
}

async function ensureTenantBrandingSeed(
  service: import("@supabase/supabase-js").SupabaseClient,
  tenantId: string,
  actorId: string,
): Promise<void> {
  const existing = await service
    .from("branding")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (existing.data) return;

  const source = await service
    .from("companies")
    .select("id,brand_name,name,logo_url,primary_color")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = source.data as
    | {
        id?: string | null;
        brand_name?: string | null;
        name?: string | null;
        logo_url?: string | null;
        primary_color?: string | null;
      }
    | null;
  if (!row) return;

  await service.from("branding").upsert(
    {
      tenant_id: tenantId,
      company_id:
        typeof row.id === "string" && row.id.trim() ? row.id.trim() : null,
      updated_by: actorId,
      brand_name:
        (typeof row.brand_name === "string" && row.brand_name.trim()) ||
        (typeof row.name === "string" && row.name.trim()) ||
        null,
      logo_url:
        typeof row.logo_url === "string" && row.logo_url.trim()
          ? row.logo_url.trim()
          : null,
      primary_color:
        typeof row.primary_color === "string" && row.primary_color.trim()
          ? row.primary_color.trim()
          : null,
    },
    { onConflict: "tenant_id" },
  );
}

function looksLikeDemoOrTestCompanyName(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  if (/(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(s)) {
    return true;
  }
  if (/(^|\b)(apple|google|microsoft|amazon|meta|tesla)(\b|$)/i.test(s)) {
    return true;
  }
  return false;
}

/**
 * Transition-API:
 * - bevorzugt neue `mandates`-Tabelle
 * - fallback auf alte `locations`-Tabelle (Legacy)
 */
export async function GET(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: CACHE_HEADERS });
  }

  const mandateId = request.nextUrl.searchParams.get("mandate_id")?.trim() ?? "";
  if (mandateId) {
    const mandateRes = await ctx.service
      .from("mandates")
      .select("id, tenant_id, title, account_user_id")
      .eq("id", mandateId)
      .maybeSingle();

    if (mandateRes.error?.message?.toLowerCase().includes("mandates")) {
      return NextResponse.json(
        { error: "Mandats-Status nicht verfügbar (Legacy-Setup)." },
        { status: 404, headers: CACHE_HEADERS },
      );
    }
    if (mandateRes.error) {
      return NextResponse.json({ error: mandateRes.error.message }, { status: 500, headers: CACHE_HEADERS });
    }
    if (!mandateRes.data) {
      return NextResponse.json({ error: "Mandat nicht gefunden." }, { status: 404, headers: CACHE_HEADERS });
    }

    const m = mandateRes.data as {
      id: string;
      tenant_id: string;
      title: string | null;
      account_user_id?: string | null;
    };

    let managerReady = false;
    const managerUserId =
      typeof m.account_user_id === "string" && m.account_user_id.trim()
        ? m.account_user_id.trim()
        : null;

    if (managerUserId) {
      const profile = await ctx.service
        .from("profiles")
        .select("id, role, tenant_id, mandant_id")
        .eq("id", managerUserId)
        .maybeSingle();
      if (profile.data) {
        const p = profile.data as {
          role?: string | null;
          tenant_id?: string | null;
          mandant_id?: string | null;
        };
        const role = (p.role ?? "").trim().toLowerCase();
        const profileTenant =
          (typeof p.mandant_id === "string" && p.mandant_id.trim()) ||
          (typeof p.tenant_id === "string" && p.tenant_id.trim()) ||
          null;
        managerReady =
          role === "manager" && profileTenant === m.tenant_id;
      }

      if (!managerReady) {
        const company = await ctx.service
          .from("companies")
          .select("user_id, tenant_id, mandant_id, role, is_subscribed")
          .eq("user_id", managerUserId)
          .eq("tenant_id", m.tenant_id)
          .maybeSingle();
        if (company.data) {
          const c = company.data as {
            role?: string | null;
            is_subscribed?: boolean | null;
            tenant_id?: string | null;
            mandant_id?: string | null;
          };
          const companyTenant =
            (typeof c.mandant_id === "string" && c.mandant_id.trim()) ||
            (typeof c.tenant_id === "string" && c.tenant_id.trim()) ||
            null;
          managerReady =
            (c.role ?? "").trim().toLowerCase() === "manager" &&
            c.is_subscribed === true &&
            companyTenant === m.tenant_id;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        mandate: {
          id: m.id,
          title: m.title,
          tenant_id: m.tenant_id,
        },
        provisioning: {
          status: managerReady ? "ready" : "pending",
          manager_user_id: managerUserId,
        },
      },
      { headers: CACHE_HEADERS },
    );
  }

  const mandatesRes = await ctx.service
    .from("mandates")
    .select("id, created_at, tenant_id, title, description")
    .order("tenant_id", { ascending: true })
    .order("title", { ascending: true });

  const useLegacyLocations =
    mandatesRes.error?.message?.toLowerCase().includes("mandates") === true;

  let list: Array<{
    id: string;
    created_at: string;
    company_id: string;
    name: string;
    address: string | null;
  }> = [];

  if (useLegacyLocations) {
    const legacy = await ctx.service
      .from("locations")
      .select("id, created_at, company_id, name, address")
      .order("company_id", { ascending: true })
      .order("name", { ascending: true });
    if (legacy.error) {
      if (legacy.error.message.includes("locations")) {
        return NextResponse.json({ groups: [] }, { headers: CACHE_HEADERS });
      }
      return NextResponse.json({ error: legacy.error.message }, { status: 500, headers: CACHE_HEADERS });
    }
    list = (legacy.data ?? []) as Array<{
      id: string;
      created_at: string;
      company_id: string;
      name: string;
      address: string | null;
    }>;
  } else if (mandatesRes.error) {
    return NextResponse.json({ error: mandatesRes.error.message }, { status: 500, headers: CACHE_HEADERS });
  } else {
    list = ((mandatesRes.data ?? []) as Array<{
      id: string;
      created_at: string;
      tenant_id: string;
      title: string;
      description: string | null;
    }>).map((m) => ({
      id: m.id,
      created_at: m.created_at,
      company_id: m.tenant_id,
      name: m.title,
      address: m.description ?? null,
    }));
  }

  const { data: comps, error: cErr } = await ctx.service
    .from("companies")
    .select("tenant_id, name, logo_url, branche, show_cta, demo_slug, is_demo_active");

  if (cErr) {
    if (cErr.message.includes("logo_url") || cErr.message.includes("branche")) {
      const fb = await ctx.service
        .from("companies")
        .select("tenant_id, name");
      if (fb.error) {
        return NextResponse.json({ error: fb.error.message }, { status: 500, headers: CACHE_HEADERS });
      }
      const nameByTenant = new Map<string, string>();
      for (const row of fb.data ?? []) {
        const r = row as { tenant_id?: string; name?: string | null };
        if (r.tenant_id && !nameByTenant.has(r.tenant_id)) {
          nameByTenant.set(
            r.tenant_id,
            (r.name ?? "Konzern").trim() || "Konzern",
          );
        }
      }
      return finishGroups(list, nameByTenant, new Map(), new Map(), CACHE_HEADERS);
    }
    return NextResponse.json({ error: cErr.message }, { status: 500, headers: CACHE_HEADERS });
  }

  const nameByTenant = new Map<string, string>();
  const logoByTenant = new Map<string, string | null>();
  const brancheByTenant = new Map<string, string | null>();
  const allowedTenantIds = new Set<string>();

  for (const row of comps ?? []) {
    const r = row as {
      tenant_id?: string;
      name?: string | null;
      logo_url?: string | null;
      branche?: string | null;
      show_cta?: boolean | null;
      demo_slug?: string | null;
      is_demo_active?: boolean | null;
    };
    if (!r.tenant_id) continue;
    const name = (r.name ?? "Konzern").trim() || "Konzern";

    // Harte Enterprise-Ready Filter (ohne DB-Änderungen).
    if (!isRealCompanyOption({ name, tenantId: r.tenant_id })) continue;
    const hasDemoSlug =
      typeof r.demo_slug === "string" && r.demo_slug.trim().length > 0;
    if (hasDemoSlug) continue;
    if (r.is_demo_active === true) continue;
    if (r.show_cta === true) continue;
    if (looksLikeDemoOrTestCompanyName(name)) continue;

    allowedTenantIds.add(r.tenant_id);

    if (!nameByTenant.has(r.tenant_id)) {
      nameByTenant.set(r.tenant_id, name);
      logoByTenant.set(
        r.tenant_id,
        typeof r.logo_url === "string" && r.logo_url.trim()
          ? r.logo_url.trim()
          : null,
      );
      brancheByTenant.set(
        r.tenant_id,
        typeof r.branche === "string" && r.branche.trim()
          ? r.branche.trim()
          : null,
      );
    }
  }

  const filteredLocs = list.filter((l) => allowedTenantIds.has(l.company_id));
  return finishGroups(filteredLocs, nameByTenant, logoByTenant, brancheByTenant, CACHE_HEADERS);
}

function finishGroups(
  list: Array<{
    id: string;
    created_at: string;
    company_id: string;
    name: string;
    address: string | null;
  }>,
  nameByTenant: Map<string, string>,
  logoByTenant: Map<string, string | null>,
  brancheByTenant: Map<string, string | null>,
  headers?: Record<string, string>,
) {

  const groups = new Map<
    string,
    {
      company_id: string;
      company_name: string;
      logo_url: string | null;
      branche: string | null;
      locations: typeof list;
    }
  >();

  for (const loc of list) {
    const g = groups.get(loc.company_id) ?? {
      company_id: loc.company_id,
      company_name: nameByTenant.get(loc.company_id) ?? "Unbekannt",
      logo_url: logoByTenant.get(loc.company_id) ?? null,
      branche: brancheByTenant.get(loc.company_id) ?? null,
      locations: [] as typeof list,
    };
    g.locations.push(loc);
    groups.set(loc.company_id, g);
  }

  return NextResponse.json(
    {
      groups: Array.from(groups.values()),
    },
    { headers },
  );
}

/**
 * Neues Mandat (legacy-kompatibel über diesen Endpoint).
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: {
    tenant_id?: string;
    company_id?: string;
    name?: string;
    title?: string;
    address?: string;
    description?: string;
    account_user_id?: string;
    manager_email?: string;
    manager_name?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const raw = (body.tenant_id ?? body.company_id ?? "").trim();
  const mandateTitle = (body.title ?? body.name ?? "").trim();
  if (!raw) {
    return NextResponse.json(
      { error: "Konzern (companies.id oder tenant_id) fehlt." },
      { status: 400 },
    );
  }
  if (!mandateTitle) {
    return NextResponse.json({ error: "Mandat-Titel fehlt." }, { status: 400 });
  }

  const tenantForLocations = await resolveMandantTenantId(ctx.service, raw);
  if (!tenantForLocations) {
    return NextResponse.json(
      { error: "Unbekannter Konzern. Bitte zuerst Konzern anlegen." },
      { status: 400 },
    );
  }

  const description = (body.description ?? body.address ?? "").trim() || null;
  const mandateId = crypto.randomUUID();
  const managerEmail =
    typeof body.manager_email === "string" ? body.manager_email.trim().toLowerCase() : "";
  const managerName =
    typeof body.manager_name === "string" && body.manager_name.trim()
      ? body.manager_name.trim().slice(0, 256)
      : mandateTitle.slice(0, 256);
  const accountUserId =
    typeof body.account_user_id === "string" && body.account_user_id.trim()
      ? body.account_user_id.trim()
      : null;

  const mandateInsert = await ctx.service
    .from("mandates")
    .insert({
      id: mandateId,
      tenant_id: tenantForLocations,
      title: mandateTitle.slice(0, 256),
      description: description ? description.slice(0, 1024) : null,
      account_user_id: accountUserId,
    })
    .select("id, created_at, tenant_id, title, description, account_user_id")
    .single();

  if (!mandateInsert.error && mandateInsert.data) {
    const m = mandateInsert.data as {
      id: string;
      created_at: string;
      tenant_id: string;
      title: string;
      description: string | null;
      account_user_id?: string | null;
    };
    await ensureTenantBrandingSeed(ctx.service, m.tenant_id, ctx.actorId);

    const stripe = getStripeServer();
    const priceId = await resolveEnterprisePriceId(ctx.service);
    if (stripe && priceId && managerEmail) {
      const base = siteBaseUrl(request);
      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: managerEmail,
        success_url: `${base}/admin/hq/locations?checkout=mandate_manager_success&mandate_id=${encodeURIComponent(m.id)}`,
        cancel_url: `${base}/admin/hq/locations?checkout=mandate_manager_canceled&mandate_id=${encodeURIComponent(m.id)}`,
        metadata: {
          provisioning_type: "mandate_manager",
          mandate_id: m.id,
          mandate_tenant_id: m.tenant_id,
          manager_email: managerEmail,
          manager_name: managerName,
          created_by: ctx.actorId,
        },
      });

      return NextResponse.json({
        mandate: m,
        location: {
          id: m.id,
          created_at: m.created_at,
          company_id: m.tenant_id,
          name: m.title,
          address: m.description,
        },
        manager_checkout_url: checkout.url ?? null,
      });
    }

    return NextResponse.json({
      mandate: m,
      location: {
        id: m.id,
        created_at: m.created_at,
        company_id: m.tenant_id,
        name: m.title,
        address: m.description,
      },
    });
  }

  const fallback = await ctx.service
    .from("locations")
    .insert({
      id: mandateId,
      company_id: tenantForLocations,
      name: mandateTitle.slice(0, 256),
      address: description ? description.slice(0, 1024) : null,
    })
    .select("id, created_at, company_id, name, address")
    .single();

  if (fallback.error || !fallback.data) {
    return NextResponse.json(
      { error: mandateInsert.error?.message ?? fallback.error?.message ?? "Mandat konnte nicht angelegt werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({ location: fallback.data });
}
