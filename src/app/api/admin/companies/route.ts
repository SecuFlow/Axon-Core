import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { isRealCompanyOption } from "@/lib/filterRealCompanies";
import { looksLikeEmailName } from "@/lib/filterRealCompanies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "private, max-age=0, stale-while-revalidate=30",
} as const;

type CompanyRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  branche?: string | null;
  user_id?: string | null;
  show_cta?: boolean | null;
  demo_slug?: string | null;
  is_demo_active?: boolean | null;
  employee_count?: number | null;
  revenue_eur?: number | null;
  market_segment?: string | null;
};

function looksLikeDemoOrTestCompanyName(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  // Harte Demo-/Test-Signale im Namen (ohne DB-Destruktion).
  if (/(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(s)) {
    return true;
  }
  // Häufige „Fake-Logo“-Konzerne aus Demos/Mocks.
  if (/(^|\b)(apple|google|microsoft|amazon|meta|tesla)(\b|$)/i.test(s)) {
    return true;
  }
  return false;
}

function hasEnterpriseSignals(r: CompanyRow): boolean {
  // Kriterien, wenn Felder existieren: Mitarbeiterzahl / Umsatz / Segment.
  const employees = typeof r.employee_count === "number" ? r.employee_count : null;
  const revenue = typeof r.revenue_eur === "number" ? r.revenue_eur : null;
  const segment =
    typeof r.market_segment === "string" && r.market_segment.trim()
      ? r.market_segment.trim().toLowerCase()
      : null;

  const employeesOk = employees == null ? true : employees >= 250;
  const revenueOk = revenue == null ? true : revenue >= 50_000_000;
  const segmentOk =
    segment == null
      ? true
      : ["enterprise", "konzern", "industry", "industrial", "manufacturing"].some((k) =>
          segment.includes(k),
        );

  return employeesOk && revenueOk && segmentOk;
}

function isRealEnterpriseCompany(r: CompanyRow): boolean {
  const name = (r.name ?? "").trim();
  if (!isRealCompanyOption({ name, tenantId: r.tenant_id ?? null })) return false;

  // Demo-Flags (wenn vorhanden) schlagen immer zu.
  const hasDemoSlug =
    typeof r.demo_slug === "string" && r.demo_slug.trim().length > 0;
  if (hasDemoSlug) return false;
  if (r.is_demo_active === true) return false;
  if (r.show_cta === true) return false;

  // Namen-basierte Hygiene (nur wenn wir „mehr“ als die Minimal-Felder haben).
  // Wir lassen Shell-Konzerne zu, aber keine offensichtlichen Demo/Test-Namen.
  if (looksLikeDemoOrTestCompanyName(name)) return false;

  return hasEnterpriseSignals(r);
}

/**
 * HQ: Konzern-Liste für Admin-Standorte-UI (Konzern-Shells inkl.).
 */
export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: CACHE_HEADERS });
  }

  // Best effort: falls Enterprise-Metadaten-Spalten fehlen, fällt der Select sauber zurück.
  const full = await ctx.service
    .from("companies")
    .select(
      "id, tenant_id, name, brand_name, logo_url, primary_color, branche, user_id, show_cta, demo_slug, is_demo_active, employee_count, revenue_eur, market_segment",
    )
    .order("name", { ascending: true });

  if (full.error) {
    if (
      full.error.message.includes("logo_url") ||
      full.error.message.includes("branche") ||
      full.error.message.includes("brand_name") ||
      full.error.message.includes("primary_color") ||
      full.error.message.includes("show_cta") ||
      full.error.message.includes("demo_slug") ||
      full.error.message.includes("is_demo_active") ||
      full.error.message.includes("employee_count") ||
      full.error.message.includes("revenue_eur") ||
      full.error.message.includes("market_segment")
    ) {
      const fb = await ctx.service
        .from("companies")
        .select("id, tenant_id, name, user_id")
        .order("name", { ascending: true });
      if (fb.error) {
        return NextResponse.json(
          { error: fb.error.message },
          { status: 500, headers: CACHE_HEADERS },
        );
      }
      const companies = (fb.data ?? [])
        .map((row) => {
          const r = row as CompanyRow;
          return {
            id: r.id,
            tenant_id: r.tenant_id,
            name: (r.name ?? "Konzern").trim() || "Konzern",
            brand_name: null as string | null,
            logo_url: null as string | null,
            primary_color: null as string | null,
            branche: null as string | null,
            show_cta: false,
            demo_slug: null as string | null,
            is_demo_active: false,
            manager_verknuepft:
              typeof r.user_id === "string" && r.user_id.length > 0,
          };
        })
        .filter((r) => isRealEnterpriseCompany(r as unknown as CompanyRow));
      return NextResponse.json({ companies }, { headers: CACHE_HEADERS });
    }
    return NextResponse.json({ error: full.error.message }, { status: 500, headers: CACHE_HEADERS });
  }

  const companies = (full.data ?? [])
    .map((row) => {
      const r = row as CompanyRow;
      return {
        id: r.id,
        tenant_id: r.tenant_id,
        name: (r.name ?? "Konzern").trim() || "Konzern",
        brand_name:
          typeof r.brand_name === "string" && r.brand_name.trim()
            ? r.brand_name.trim()
            : null,
        logo_url:
          typeof r.logo_url === "string" && r.logo_url.trim()
            ? r.logo_url.trim()
            : null,
        primary_color:
          typeof r.primary_color === "string" && r.primary_color.trim()
            ? r.primary_color.trim()
            : null,
        branche:
          typeof r.branche === "string" && r.branche.trim()
            ? r.branche.trim()
            : null,
        show_cta: r.show_cta === true,
        demo_slug:
          typeof r.demo_slug === "string" && r.demo_slug.trim()
            ? r.demo_slug.trim()
            : null,
        is_demo_active: r.is_demo_active === true,
        manager_verknuepft:
          typeof r.user_id === "string" && r.user_id.length > 0,
        employee_count:
          typeof r.employee_count === "number" ? r.employee_count : null,
        revenue_eur: typeof r.revenue_eur === "number" ? r.revenue_eur : null,
        market_segment:
          typeof r.market_segment === "string" && r.market_segment.trim()
            ? r.market_segment.trim()
            : null,
      };
    })
    .filter((r) => isRealEnterpriseCompany(r as unknown as CompanyRow));

  return NextResponse.json({ companies }, { headers: CACHE_HEADERS });
}

/**
 * Shell-Konzern: Name + Mandanten-tenant_id (Default), optional ohne user_id.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: {
    name?: unknown;
    branche?: unknown;
    market_segment?: unknown;
    employee_count?: unknown;
    revenue_eur?: unknown;
    hq_name?: unknown;
    hq_address?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const nameRaw = typeof body.name === "string" ? body.name : "";
  const name = nameRaw.trim();
  if (!name) return NextResponse.json({ error: "Name ist erforderlich." }, { status: 400 });
  if (looksLikeEmailName(name)) {
    return NextResponse.json(
      { error: "Ungültiger Konzernname (wirkt wie eine E-Mail-Adresse)." },
      { status: 400 },
    );
  }
  if (looksLikeDemoOrTestCompanyName(name)) {
    return NextResponse.json(
      { error: "Ungültiger Konzernname (Demo/Test/Platzhalter ist nicht zulässig)." },
      { status: 400 },
    );
  }

  const brancheRaw = typeof body.branche === "string" ? body.branche : "";
  const branche = brancheRaw.trim();
  if (!branche) {
    return NextResponse.json({ error: "Branche ist erforderlich." }, { status: 400 });
  }

  const segRaw = typeof body.market_segment === "string" ? body.market_segment : "";
  const market_segment = segRaw.trim();
  if (!market_segment) {
    return NextResponse.json(
      { error: "Marktsegment ist erforderlich." },
      { status: 400 },
    );
  }

  const emp =
    typeof body.employee_count === "number"
      ? body.employee_count
      : typeof body.employee_count === "string"
        ? Number(body.employee_count)
        : NaN;
  if (!Number.isFinite(emp) || emp <= 0 || emp > 5_000_000) {
    return NextResponse.json(
      { error: "Mitarbeiterzahl ist erforderlich und muss plausibel sein." },
      { status: 400 },
    );
  }

  const rev =
    typeof body.revenue_eur === "number"
      ? body.revenue_eur
      : typeof body.revenue_eur === "string"
        ? Number(body.revenue_eur)
        : NaN;
  if (!Number.isFinite(rev) || rev <= 0 || rev > 10_000_000_000_000) {
    return NextResponse.json(
      { error: "Umsatz (EUR) ist erforderlich und muss plausibel sein." },
      { status: 400 },
    );
  }

  const hqNameRaw = typeof body.hq_name === "string" ? body.hq_name : "";
  const hqName = hqNameRaw.trim() || "Headquarter";
  const hqAddrRaw = typeof body.hq_address === "string" ? body.hq_address : "";
  const hqAddress = hqAddrRaw.trim();
  if (!hqAddress) {
    return NextResponse.json(
      { error: "HQ-Location (Adresse) ist erforderlich." },
      { status: 400 },
    );
  }

  const insertPayload: Record<string, unknown> = {
    name: name.slice(0, 512),
    branche: branche.slice(0, 128),
    market_segment: market_segment.slice(0, 64),
    employee_count: Math.round(emp),
    revenue_eur: Math.round(rev),
    role: "user",
    is_subscribed: false,
  };

  const { data, error } = await ctx.service
    .from("companies")
    .insert(insertPayload)
    .select("id, tenant_id, name, branche, market_segment, employee_count, revenue_eur")
    .single();

  if (error) {
    // Non-destruktiv: wenn Spalten fehlen, klarer Hinweis statt stiller Degradierung.
    if (
      error.message.includes("branche") ||
      error.message.includes("market_segment") ||
      error.message.includes("employee_count") ||
      error.message.includes("revenue_eur")
    ) {
      return NextResponse.json(
        {
          error:
            "Enterprise-Pflichtfelder sind serverseitig aktiv, aber die DB-Spalten fehlen/werden noch nicht erkannt. Bitte Migration/Schema-Cache aktualisieren und erneut versuchen.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tenantRaw = (data as { tenant_id?: unknown } | null)?.tenant_id;
  const tenantId =
    typeof tenantRaw === "string" && tenantRaw.trim() ? tenantRaw.trim() : null;

  if (tenantId) {
    const { error: hqErr } = await ctx.service.from("locations").insert({
      company_id: tenantId,
      name: hqName.slice(0, 256),
      address: hqAddress.slice(0, 1024),
    });
    if (hqErr) {
      return NextResponse.json(
        {
          error:
            "Konzern wurde angelegt, aber HQ-Location konnte nicht gespeichert werden.",
          detail: hqErr.message,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ company: data });
}
