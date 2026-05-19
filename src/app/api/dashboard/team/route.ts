import { NextRequest, NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { isRealCompanyOption } from "@/lib/filterRealCompanies";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";
import { logEvent } from "@/lib/auditLog";
import { PRIVATE_SWR_HEADERS } from "@/lib/httpCache";
import {
  loadTenantByCompanyPkMap,
  resolveProfileMandantTenantIdFromMaps,
} from "@/lib/profileMandateResolve.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isEmail(v: string): boolean {
  const t = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function looksLikeEmailName(raw: string): boolean {
  const s = raw.trim();
  if (!s.includes("@")) return false;
  return isEmail(s);
}

function generateTempPassword(): string {
  // 12 chars, readable, meets min length >= 8
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function managerCompanyIdOrNull(ctx: Extract<Awaited<ReturnType<typeof requireKonzernTenantContext>>, { ok: true }>) {
  if (ctx.isAdmin) return null;
  const { data: meProf } = await ctx.service
    .from("profiles")
    .select("company_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  const cid = (meProf as { company_id?: string | null } | null)?.company_id;
  if (typeof cid === "string" && cid.length > 0) {
    return cid;
  }
  const { data: myCo } = await ctx.service
    .from("companies")
    .select("id")
    .eq("user_id", ctx.userId)
    .limit(1)
    .maybeSingle();
  const coId = (myCo as { id?: string } | null)?.id;
  return typeof coId === "string" && coId.length > 0 ? coId : null;
}

function combinedRoleLabel(roleNorm: string): string {
  if (roleNorm === "manager") return "Manager";
  if (roleNorm === "admin") return "Admin";
  return "Mitarbeiter";
}

function combinedRoleValue(roleNorm: string): "mitarbeiter" | "manager" | "admin" {
  if (roleNorm === "manager") return "manager";
  if (roleNorm === "admin") return "admin";
  return "mitarbeiter";
}

/**
 * Team-Liste: profiles.id = Auth-UUID (kein profiles.user_id).
 *
 * Query `mandate_scope=1` (Konzern-Dashboard): niemals globales Auth-Listing —
 * nur Nutzer mit derselben Mandanten-UUID wie der Betrachter.
 * Admin HQ ohne diesen Parameter: globale Liste (Plattform-Admin).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const mandateScope =
    new URL(request.url).searchParams.get("mandate_scope") === "1";
  const enforceMandateFilter = mandateScope || !ctx.isAdmin;

  const canView =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canView) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { service } = ctx;

  const actorMandantId = await resolveActorMandantId(service, ctx.userId);
  const scopeTenantId = ctx.tenantId ?? actorMandantId;

  if (enforceMandateFilter && !scopeTenantId) {
    return NextResponse.json(
      {
        error:
          "Kein Mandanten-Kontext — Team-Liste nur mit Konzern-Zuweisung verfügbar.",
        actorId: ctx.userId,
        viewer: {
          isAdmin: ctx.isAdmin,
          isManagerScope: false,
          canAssignCompany: ctx.isAdmin && !mandateScope,
          canAssignLocation: true,
          canChangeRole: true,
        },
        companyOptions: [],
        locations: [],
        users: [],
      },
      { status: 403, headers: PRIVATE_SWR_HEADERS },
    );
  }

  // ---------------------------------------------------------------------------
  // Phase 1: alle unabhängigen Reads parallel anschieben.
  // ---------------------------------------------------------------------------
  const [
    profRowsRes,
    authListRes,
    compRowsRes,
    companyPickRes,
  ] = await Promise.all([
    service
      .from("profiles")
      .select("id, role, company_id, tenant_id, mandant_id, location_id"),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    service.from("companies").select("user_id, role, tenant_id, is_subscribed, name"),
    service
      .from("companies")
      .select("id, name, tenant_id")
      .order("name", { ascending: true }),
  ]);

  if (profRowsRes.error) {
    return NextResponse.json({ error: profRowsRes.error.message }, { status: 500 });
  }
  if (authListRes.error) {
    return NextResponse.json({ error: authListRes.error.message }, { status: 500 });
  }
  if (compRowsRes.error) {
    return NextResponse.json({ error: compRowsRes.error.message }, { status: 500 });
  }
  if (companyPickRes.error) {
    return NextResponse.json({ error: companyPickRes.error.message }, { status: 500 });
  }

  const profRows = profRowsRes.data;
  const listData = authListRes.data;
  const compRows = compRowsRes.data;
  const companyPick = companyPickRes.data;

  const profileById = new Map<
    string,
    {
      role?: unknown;
      company_id: string | null;
      tenant_id: string | null;
      mandant_id: string | null;
      location_id: string | null;
    }
  >();

  for (const row of profRows ?? []) {
    const id = (row as { id?: string }).id;
    if (typeof id !== "string" || !id) continue;
    const cid = (row as { company_id?: string | null }).company_id;
    const tid = (row as { tenant_id?: string | null }).tenant_id;
    const mid = (row as { mandant_id?: string | null }).mandant_id;
    const lid = (row as { location_id?: string | null }).location_id;
    profileById.set(id, {
      role: (row as { role?: unknown }).role,
      company_id:
        typeof cid === "string" && cid.trim().length > 0 ? cid.trim() : null,
      tenant_id:
        typeof tid === "string" && tid.trim().length > 0 ? tid.trim() : null,
      mandant_id:
        typeof mid === "string" && mid.trim().length > 0 ? mid.trim() : null,
      location_id:
        typeof lid === "string" && lid.trim().length > 0 ? lid.trim() : null,
    });
  }

  const companyByUser = new Map<string, string>();
  const subscribedByUser = new Map<string, boolean>();
  const companyNameByUser = new Map<string, string | null>();
  for (const row of compRows ?? []) {
    const r = row as {
      user_id?: string;
      role?: unknown;
      is_subscribed?: boolean;
      name?: string | null;
    };
    if (typeof r.user_id !== "string" || !r.user_id) continue;
    companyByUser.set(r.user_id, normalizeDbRole(r.role) || "user");
    subscribedByUser.set(r.user_id, r.is_subscribed === true);
    companyNameByUser.set(
      r.user_id,
      typeof r.name === "string" ? r.name : null,
    );
  }

  const companyOptionsFull =
    (companyPick ?? [])
      .map((row) => {
        const r = row as {
          id?: string;
          name?: string | null;
          tenant_id?: string | null;
        };
        if (typeof r.id !== "string" || !r.id) return null;
        return {
          id: r.id,
          name:
            typeof r.name === "string" && r.name.trim().length > 0
              ? r.name.trim()
              : "Konzern",
          tenantId:
            typeof r.tenant_id === "string" && r.tenant_id.length > 0
              ? r.tenant_id
              : null,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      tenantId: string | null;
    }>;

  const companyOptionsFiltered = companyOptionsFull.filter((c) =>
    isRealCompanyOption({ name: c.name, tenantId: c.tenantId }),
  );

  /** companies.id → Anzeigename (Hauptquelle für Mandanten-Spalte) */
  const companyIdToName = new Map<string, string>();
  const tenantToCompanyName = new Map<string, string>();
  for (const c of companyOptionsFiltered) {
    companyIdToName.set(c.id, c.name);
    if (c.tenantId && !tenantToCompanyName.has(c.tenantId)) {
      tenantToCompanyName.set(c.tenantId, c.name);
    }
  }

  // Falls keine "echte" Company-Zeile (name != email) existiert, nehmen wir Branding-Name als Fallback.
  const tenantIdsFromProfiles = new Set<string>();
  for (const [, pr] of profileById) {
    if (pr.mandant_id) tenantIdsFromProfiles.add(pr.mandant_id);
    if (pr.tenant_id) tenantIdsFromProfiles.add(pr.tenant_id);
  }
  const brandingNameByTenant = new Map<string, string>();
  if (tenantIdsFromProfiles.size > 0) {
    const brandingRes = await service
      .from("branding")
      .select("tenant_id, brand_name")
      .in("tenant_id", [...tenantIdsFromProfiles]);
    if (!brandingRes.error) {
      for (const row of (brandingRes.data ?? []) as Array<{
        tenant_id?: string | null;
        brand_name?: string | null;
      }>) {
        const tid =
          typeof row.tenant_id === "string" && row.tenant_id.trim()
            ? row.tenant_id.trim()
            : "";
        const bn =
          typeof row.brand_name === "string" && row.brand_name.trim()
            ? row.brand_name.trim()
            : "";
        if (tid && bn && !brandingNameByTenant.has(tid)) {
          brandingNameByTenant.set(tid, bn);
        }
      }
    }
  }

  const locsRes = await service
    .from("locations")
    .select("id, name, company_id")
    .order("name", { ascending: true });
  if (locsRes.error) {
    return NextResponse.json({ error: locsRes.error.message }, { status: 500 });
  }

  const tenantByCompanyPk = await loadTenantByCompanyPkMap(service);
  const companyPkToName = new Map<string, string>();
  for (const c of companyOptionsFiltered) {
    companyPkToName.set(c.id, c.name);
  }
  const { data: companyNamesRes } = await service
    .from("companies")
    .select("id, name")
    .not("name", "is", null);
  for (const row of companyNamesRes ?? []) {
    const r = row as { id?: string; name?: string | null };
    if (typeof r.id === "string" && r.id.length > 0) {
      const n = typeof r.name === "string" ? r.name.trim() : "";
      if (n) companyPkToName.set(r.id, n);
    }
  }

  const locRows = locsRes.data;

  const locRowsAll = (locRows ?? []) as Array<{
    id: string;
    name: string;
    company_id: string;
  }>;

  let locations = locRowsAll;
  if (enforceMandateFilter && scopeTenantId) {
    locations = locations.filter((l) => l.company_id === scopeTenantId);
  }

  /** Konzern-Dashboard: nur Profile mit exakt dieser Mandanten-UUID. */
  const mandateAllowedUserIds = new Set<string>();
  if (enforceMandateFilter && scopeTenantId) {
    for (const [profileId, pr] of profileById) {
      const recMandant = resolveProfileMandantTenantIdFromMaps(
        {
          company_id: pr.company_id,
          tenant_id: pr.tenant_id,
          mandant_id: pr.mandant_id,
        },
        tenantByCompanyPk,
      );
      if (recMandant === scopeTenantId) {
        mandateAllowedUserIds.add(profileId);
      }
    }
  }

  const users = (listData?.users ?? [])
    .filter((authUser) => {
      if (!enforceMandateFilter) return true;
      return mandateAllowedUserIds.has(authUser.id);
    })
    .map((authUser) => {
      const userId = authUser.id;
      const row = profileById.get(userId);

      if (enforceMandateFilter && scopeTenantId) {
        if (!row) return null;
        const recMandant = resolveProfileMandantTenantIdFromMaps(
          {
            company_id: row.company_id,
            tenant_id: row.tenant_id,
            mandant_id: row.mandant_id,
          },
          tenantByCompanyPk,
        );
        if (!recMandant || recMandant !== scopeTenantId) {
          void logEvent(
            "security.mandant_mismatch",
            "Team-Liste: Nutzer ausgefiltert (Mandanten-Mismatch).",
            {
              resource: "profiles",
              target_user_id: userId,
              actor_mandant_id: scopeTenantId,
              record_mandant_id: recMandant,
            },
            { service, userId: ctx.userId, tenantId: scopeTenantId },
          );
          return null;
        }
      }

      const meta = authUser.user_metadata as
        | Record<string, unknown>
        | undefined;
      const fn =
        (meta?.first_name as string | undefined)?.trim() ??
        (meta?.firstName as string | undefined)?.trim() ??
        "";
      const ln =
        (meta?.last_name as string | undefined)?.trim() ??
        (meta?.lastName as string | undefined)?.trim() ??
        "";
      const full =
        [fn, ln].filter(Boolean).join(" ").trim() ||
        (typeof meta?.full_name === "string" ? meta.full_name.trim() : "") ||
        (typeof meta?.name === "string" ? meta.name.trim() : "");

      const email = authUser.email ?? "";
      const displayName = full || email || userId.slice(0, 8);

      const profRoleNorm = normalizeDbRole(row?.role);
      const companyRoleNorm = companyByUser.get(userId) ?? "";
      const roleNorm =
        profRoleNorm === "admin" || companyRoleNorm === "admin"
          ? "admin"
          : profRoleNorm === "manager" || companyRoleNorm === "manager"
            ? "manager"
            : "mitarbeiter";
      const isSubscribed = subscribedByUser.get(userId) ?? false;
      const companyAccountName = companyNameByUser.get(userId) ?? null;

      const profileTenantId = row?.tenant_id ?? null;

      const mandateTenantId = row
        ? resolveProfileMandantTenantIdFromMaps(
            {
              company_id: row.company_id,
              tenant_id: row.tenant_id,
              mandant_id: row.mandant_id,
            },
            tenantByCompanyPk,
          )
        : null;

      /**
       * Mandanten-Anzeige: zuerst Firmenname über profiles.company_id (Admin-Zuweisung);
       * sonst tenant_id auflösen.
       */
      let tenantAffiliation = "—";
      if (row?.company_id) {
        const byPk =
          companyPkToName.get(row.company_id) ??
          companyIdToName.get(row.company_id) ??
          "";
        if (byPk && !looksLikeEmailName(byPk)) {
          tenantAffiliation = byPk;
        }
      }
      if (tenantAffiliation === "—" && mandateTenantId) {
        const bn = brandingNameByTenant.get(mandateTenantId) ?? null;
        tenantAffiliation =
          tenantToCompanyName.get(mandateTenantId) ??
          (bn && !looksLikeEmailName(bn) ? bn : undefined) ??
          companyIdToName.get(mandateTenantId) ??
          `Mandant ${mandateTenantId.slice(0, 8)}…`;
      } else if (tenantAffiliation === "—" && profileTenantId) {
        const bn = brandingNameByTenant.get(profileTenantId) ?? null;
        tenantAffiliation =
          tenantToCompanyName.get(profileTenantId) ??
          (bn && !looksLikeEmailName(bn) ? bn : undefined) ??
          companyIdToName.get(profileTenantId) ??
          `Mandant ${profileTenantId.slice(0, 8)}…`;
      }

      const assignedCompanyRowId = row?.company_id ?? null;
      const locationId = row?.location_id ?? null;

      return {
        userId,
        email,
        displayName,
        roleLabel: combinedRoleLabel(roleNorm),
        roleValue: combinedRoleValue(roleNorm),
        isSubscribed,
        companyAccountName,
        mandateTenantId,
        tenantAffiliation,
        profileTenantId,
        locationId,
        assignedCompanyRowId,
      };
    })
    .filter(Boolean);

  return NextResponse.json(
    {
      actorId: ctx.userId,
      viewer: {
        isAdmin: ctx.isAdmin,
        isManagerScope: enforceMandateFilter && scopeTenantId != null,
        canAssignCompany: ctx.isAdmin && !mandateScope,
        canAssignLocation: true,
        canChangeRole: true,
      },
      mandate_scope: mandateScope,
      scope_tenant_id: enforceMandateFilter ? scopeTenantId : null,
      companyOptions: ctx.isAdmin && !mandateScope
        ? companyOptionsFiltered.map(({ id, name, tenantId }) => ({
            id,
            name,
            tenantId,
          }))
        : [],
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        tenantId: l.company_id,
      })),
      users,
    },
    { headers: PRIVATE_SWR_HEADERS },
  );
}

/**
 * Manager-CRUD: Mitarbeiter-Account für Worker-App anlegen.
 * Erstellt Auth-User + profiles-Row (mandant/tenant bound) und gibt ein temporäres Passwort zurück.
 */
export async function POST(req: Request) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const canWrite =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canWrite) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }
  if (!ctx.tenantId && !ctx.isAdmin) {
    return NextResponse.json({ error: "Kein Mandanten-Kontext." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = cleanText(b.email).toLowerCase();
  const firstName = cleanText(b.first_name ?? b.firstName);
  const lastName = cleanText(b.last_name ?? b.lastName);
  const password = cleanText(b.password) || generateTempPassword();
  const locationId = cleanText(b.location_id) || null;

  if (!email || !isEmail(email)) {
    return NextResponse.json({ error: "Gültige E-Mail ist erforderlich." }, { status: 400 });
  }

  const tenantId = ctx.isAdmin ? cleanText(b.tenant_id) || null : ctx.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Mandant fehlt." }, { status: 400 });
  }

  // Für Manager: profiles.company_id muss auf companies.id des Managers zeigen, sonst erscheint der User nicht in der Liste.
  const managerCompanyId = await managerCompanyIdOrNull(ctx);
  if (!ctx.isAdmin && !managerCompanyId) {
    return NextResponse.json(
      { error: "Manager ist keinem Konzern (profiles.company_id) zugeordnet." },
      { status: 403 },
    );
  }

  const created = await ctx.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName || undefined,
      last_name: lastName || undefined,
    },
  });

  if (created.error || !created.data.user) {
    return NextResponse.json(
      { error: created.error?.message ?? "Account konnte nicht erstellt werden." },
      { status: 400 },
    );
  }

  const userId = created.data.user.id;
  const now = new Date().toISOString();

  // Profile binden (tenant + mandant + company_id + worker-role + Passwortwechsel erzwingen).
  // mandant_id ist seit Migration 20260415213000 NOT NULL und muss auf einer
  // migrierten DB explizit gesetzt werden — sonst schlägt der Insert fehl.
  const profileBase: Record<string, unknown> = {
    id: userId,
    company_id: ctx.isAdmin ? null : managerCompanyId,
    tenant_id: tenantId,
    mandant_id: tenantId,
    location_id: locationId,
    role: "user",
    must_change_password: true,
    updated_at: now,
  };

  const upsertProfile = async (payload: Record<string, unknown>) =>
    ctx.service.from("profiles").upsert(payload, { onConflict: "id" });

  let up = await upsertProfile(profileBase);
  if (up.error?.message.includes("must_change_password")) {
    const fb = { ...profileBase };
    delete fb.must_change_password;
    up = await upsertProfile(fb);
  }
  if (up.error?.message.includes("mandant_id")) {
    // Legacy-DB ohne mandant_id-Spalte: graceful fallback auf tenant_id-only.
    const fb = { ...profileBase };
    delete fb.mandant_id;
    up = await upsertProfile(fb);
    if (up.error?.message.includes("must_change_password")) {
      delete fb.must_change_password;
      up = await upsertProfile(fb);
    }
  }

  if (up.error) {
    return NextResponse.json(
      { error: up.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    temp_password: password,
  });
}
