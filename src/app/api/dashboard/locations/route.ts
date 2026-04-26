import { NextRequest, NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import {
  resolveCompanyRowId,
  resolveMandantTenantId,
} from "@/lib/resolveMandantTenantId";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRIENDLY_KONZERN_HINT =
  "Wähle einen Konzern aus, um dessen Standorte zu sehen oder erstelle den ersten Standort für diesen Mandanten.";

function canManageLocations(ctx: {
  isAdmin: boolean;
  companyRole: string;
}): boolean {
  if (ctx.isAdmin) return true;
  const r = normalizeDbRole(ctx.companyRole);
  return r === "manager" || r === "admin";
}

function locationsPayload(
  ctx: { isAdmin: boolean; companyRole: string },
  extra: Record<string, unknown>,
  standortMeta?: {
    profile_role: string;
    mandate_company_name: string | null;
    profile_company_id: string | null;
    mandant_switcher_eligible: boolean;
  },
) {
  return {
    ...extra,
    is_admin: ctx.isAdmin,
    can_manage_locations: canManageLocations(ctx),
    company_role: ctx.companyRole,
    ...(standortMeta ?? {}),
  };
}

async function loadProfileCompany(
  service: SupabaseClient,
  userId: string,
): Promise<{
  company_id: string | null;
  tenant_id: string | null;
  role: string;
}> {
  const { data } = await service
    .from("profiles")
    .select("company_id, tenant_id, role")
    .eq("id", userId)
    .maybeSingle();
  const p = data as {
    company_id?: string | null;
    tenant_id?: string | null;
    role?: unknown;
  } | null;
  const cid =
    typeof p?.company_id === "string" && p.company_id.trim().length > 0
      ? p.company_id.trim()
      : null;
  const tid =
    typeof p?.tenant_id === "string" && p.tenant_id.trim().length > 0
      ? p.tenant_id.trim()
      : null;
  return {
    company_id: cid,
    tenant_id: tid,
    role: normalizeDbRole(p?.role),
  };
}

async function mandateCompanyDisplayName(
  service: SupabaseClient,
  prof: { company_id: string | null; tenant_id: string | null },
): Promise<string | null> {
  const pk = prof.company_id;
  if (pk) {
    const { data } = await service
      .from("companies")
      .select("name")
      .eq("id", pk)
      .maybeSingle();
    const n = (data as { name?: string | null } | null)?.name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  const tid = prof.tenant_id;
  if (tid) {
    const { data } = await service
      .from("companies")
      .select("name")
      .eq("tenant_id", tid)
      .limit(1)
      .maybeSingle();
    const n = (data as { name?: string | null } | null)?.name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  return null;
}

function firstProfileScope(p: {
  company_id: string | null;
  tenant_id: string | null;
}): string {
  return p.company_id ?? p.tenant_id ?? "";
}

async function managerMandateTenantId(
  service: SupabaseClient,
  prof: Awaited<ReturnType<typeof loadProfileCompany>>,
): Promise<string | null> {
  const scope = firstProfileScope(prof);
  if (scope) {
    const resolved = await resolveMandantTenantId(service, scope);
    if (resolved) return resolved;
  }
  const tid = prof.tenant_id?.trim();
  return tid && tid.length > 0 ? tid : null;
}

/**
 * Werke/Standorte für den Mandanten.
 * Profil manager: immer Mandant aus Profil (keine URL-Umgehung).
 * Plattform-Admin ohne manager-Rolle: Query company_id / tenantId.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const url = new URL(request.url);
  const rawParam = (
    url.searchParams.get("company_id") ?? url.searchParams.get("tenantId") ??
    ""
  ).trim();

  const prof = await loadProfileCompany(ctx.service, ctx.userId);
  const profileScope = firstProfileScope(prof);
  const mandateName = await mandateCompanyDisplayName(ctx.service, prof);
  const isProfileManager = prof.role === "manager";
  const standortMeta = {
    profile_role: prof.role,
    mandate_company_name: mandateName,
    profile_company_id: prof.company_id,
    mandant_switcher_eligible: ctx.isAdmin && !isProfileManager,
  };

  let filterTenantId: string | null = null;

  if (isProfileManager) {
    filterTenantId = await managerMandateTenantId(ctx.service, prof);
    if (!filterTenantId) {
      return NextResponse.json(
        locationsPayload(
          ctx,
          {
            error:
              "Kein Mandant im Profil — bitte Konzern-Zuweisung durch den Administrator.",
            default_company_id: null,
          },
          standortMeta,
        ),
        { status: 403 },
      );
    }
  } else if (ctx.isAdmin) {
    const raw = rawParam || profileScope;
    if (!raw) {
      return NextResponse.json(
        locationsPayload(
          ctx,
          {
            error:
              "Als Admin ist keine Firma gewählt und im Profil fehlt company_id/tenant_id.",
            error_tone: "info",
            default_company_id: null,
          },
          standortMeta,
        ),
        { status: 400 },
      );
    }
    filterTenantId = await resolveMandantTenantId(ctx.service, raw);
    if (!filterTenantId) {
      return NextResponse.json(
        locationsPayload(
          ctx,
          {
            error: FRIENDLY_KONZERN_HINT,
            error_tone: "info",
            default_company_id: null,
          },
          standortMeta,
        ),
        { status: 400 },
      );
    }
  } else {
    filterTenantId = ctx.tenantId;
    if (!filterTenantId) {
      return NextResponse.json(
        locationsPayload(
          ctx,
          {
            error: "Standorte sind nur für Konzern-Konten verfügbar.",
            default_company_id: null,
          },
          standortMeta,
        ),
        { status: 403 },
      );
    }
  }

  const { data, error } = await ctx.service
    .from("locations")
    .select("id, created_at, company_id, name, address")
    .eq("company_id", filterTenantId)
    .order("name", { ascending: true });

  const defaultCompanyPk =
    standortMeta.mandant_switcher_eligible && profileScope
      ? await resolveCompanyRowId(ctx.service, profileScope)
      : null;

  if (error) {
    if (error.message.includes("locations")) {
      return NextResponse.json(
        locationsPayload(
          ctx,
          {
            locations: [],
            default_company_id: defaultCompanyPk,
          },
          standortMeta,
        ),
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    locationsPayload(
      ctx,
      {
        locations: data ?? [],
        default_company_id: defaultCompanyPk,
      },
      standortMeta,
    ),
  );
}

export async function POST(request: NextRequest) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: {
    name?: string;
    address?: string;
    company_id?: string;
    tenant_id?: string;
  };
  try {
    body = (await request.json()) as {
      name?: string;
      address?: string;
      company_id?: string;
      tenant_id?: string;
    };
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const prof = await loadProfileCompany(ctx.service, ctx.userId);
  const profileScope = firstProfileScope(prof);
  const isProfileManager = prof.role === "manager";

  let targetTenantId: string;
  if (isProfileManager) {
    const tid = await managerMandateTenantId(ctx.service, prof);
    if (!tid) {
      return NextResponse.json(
        { error: "Kein Mandant im Profil." },
        { status: 403 },
      );
    }
    if (!canManageLocations(ctx)) {
      return NextResponse.json(
        {
          error:
            "Nur Manager oder Administratoren können Standorte anlegen.",
        },
        { status: 403 },
      );
    }
    targetTenantId = tid;
  } else if (ctx.isAdmin) {
    const fromBody = (body.company_id ?? "").trim();
    const fromBodyTenant = (body.tenant_id ?? "").trim();
    const fromQuery = (
      request.nextUrl.searchParams.get("company_id") ??
      request.nextUrl.searchParams.get("tenantId") ??
      ""
    ).trim();
    const raw =
      fromBody || fromQuery || fromBodyTenant || profileScope;
    if (!raw) {
      return NextResponse.json(
        {
          error:
            "Als Admin bitte Mandant wählen oder company_id/tenant_id im Profil hinterlegen.",
          error_tone: "info",
          is_admin: true,
        },
        { status: 400 },
      );
    }
    const resolved = await resolveMandantTenantId(ctx.service, raw);
    if (!resolved) {
      return NextResponse.json(
        {
          error: FRIENDLY_KONZERN_HINT,
          error_tone: "info",
          is_admin: true,
        },
        { status: 400 },
      );
    }
    targetTenantId = resolved;
  } else {
    if (!ctx.tenantId) {
      return NextResponse.json(
        { error: "Nur Konzern-Konten können Standorte anlegen." },
        { status: 403 },
      );
    }
    if (!canManageLocations(ctx)) {
      return NextResponse.json(
        {
          error:
            "Nur Manager oder Administratoren können Standorte anlegen.",
        },
        { status: 403 },
      );
    }
    targetTenantId = ctx.tenantId;
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name ist erforderlich." }, { status: 400 });
  }
  const address = (body.address ?? "").trim() || null;

  const { data, error } = await ctx.service
    .from("locations")
    .insert({
      // Mandanten-UUID der gewählten Firma (entspricht tenant_id in companies)
      company_id: targetTenantId,
      name: name.slice(0, 256),
      address: address ? address.slice(0, 512) : null,
    })
    .select("id, created_at, company_id, name, address")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ location: data });
}
