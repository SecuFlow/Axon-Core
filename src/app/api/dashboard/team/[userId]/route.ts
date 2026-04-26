import { NextRequest, NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProfileRow = {
  company_id?: string | null;
  tenant_id?: string | null;
  location_id?: string | null;
  role?: unknown;
  must_change_password?: boolean | null;
};

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isEmail(v: string): boolean {
  const t = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function tenantForProfileCompany(
  service: import("@supabase/supabase-js").SupabaseClient,
  companyPk: string | null | undefined,
): Promise<string | null> {
  if (typeof companyPk !== "string" || !companyPk.trim()) return null;
  const { data } = await service
    .from("companies")
    .select("tenant_id")
    .eq("id", companyPk.trim())
    .maybeSingle();
  const t = (data as { tenant_id?: string | null } | null)?.tenant_id;
  return typeof t === "string" && t.length > 0 ? t : null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const canPatch =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canPatch) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { userId: targetUserId } = await context.params;
  if (!targetUserId?.trim()) {
    return NextResponse.json({ error: "Nutzer-ID fehlt." }, { status: 400 });
  }

  let body: {
    assign_company_id?: string | null;
    location_id?: string | null;
    role?: "mitarbeiter" | "manager" | "admin";
    email?: string;
    first_name?: string;
    last_name?: string;
    password?: string;
    reset_password?: boolean;
    must_change_password?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const hasChange =
    body.assign_company_id !== undefined ||
    body.location_id !== undefined ||
    body.role !== undefined ||
    body.email !== undefined ||
    body.first_name !== undefined ||
    body.last_name !== undefined ||
    body.password !== undefined ||
    body.reset_password === true ||
    body.must_change_password !== undefined;
  if (!hasChange) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren." },
      { status: 400 },
    );
  }

  const { service } = ctx;
  const idEq = targetUserId.trim();
  const now = new Date().toISOString();

  let { data: profileRow, error: loadErr } = await service
    .from("profiles")
    .select("id, role, company_id, tenant_id, location_id, must_change_password")
    .eq("id", idEq)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  if (!profileRow && ctx.isAdmin) {
    const { error: insProfErr } = await service.from("profiles").insert({
      id: idEq,
      updated_at: now,
    });
    if (
      insProfErr &&
      !insProfErr.message.toLowerCase().includes("duplicate")
    ) {
      return NextResponse.json(
        { error: insProfErr.message },
        { status: 500 },
      );
    }
    const again = await service
      .from("profiles")
      .select("id, role, company_id, tenant_id, location_id, must_change_password")
      .eq("id", idEq)
      .maybeSingle();
    profileRow = again.data;
    loadErr = again.error;
  }

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }
  if (!profileRow) {
    return NextResponse.json(
      { error: "Profil nicht gefunden." },
      { status: 404 },
    );
  }

  const prof = profileRow as ProfileRow;
  const profRole = normalizeDbRole(prof.role);

  if (!ctx.isAdmin && profRole === "admin") {
    return NextResponse.json(
      { error: "Kein Zugriff auf Plattform-Admins." },
      { status: 403 },
    );
  }

  let managerCompanyId: string | null = null;
  if (!ctx.isAdmin) {
    const { data: meProf } = await service
      .from("profiles")
      .select("company_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    const cid = (meProf as { company_id?: string | null } | null)?.company_id;
    if (typeof cid === "string" && cid.length > 0) {
      managerCompanyId = cid;
    } else {
      const { data: myCo } = await service
        .from("companies")
        .select("id")
        .eq("user_id", ctx.userId)
        .limit(1)
        .maybeSingle();
      const coId = (myCo as { id?: string } | null)?.id;
      if (typeof coId === "string" && coId.length > 0) {
        managerCompanyId = coId;
      }
    }
    if (!managerCompanyId || prof.company_id !== managerCompanyId) {
      return NextResponse.json(
        { error: "Nutzer gehört nicht zu Ihrem Konzern." },
        { status: 403 },
      );
    }
  }

  if (
    body.assign_company_id !== undefined &&
    body.assign_company_id !== null &&
    !ctx.isAdmin
  ) {
    return NextResponse.json(
      { error: "Nur Admins können einen Konzern zuweisen." },
      { status: 403 },
    );
  }

  if (body.role === "admin" && !ctx.isAdmin) {
    return NextResponse.json(
      { error: "Nur Admins können die Rolle Admin setzen." },
      { status: 403 },
    );
  }

  async function currentProfile(): Promise<ProfileRow | null> {
    const { data: p } = await service
      .from("profiles")
      .select("id, role, company_id, tenant_id, location_id, must_change_password")
      .eq("id", idEq)
      .maybeSingle();
    return (p as ProfileRow | null) ?? null;
  }

  let mandateTenant: string | null = await tenantForProfileCompany(
    service,
    prof.company_id,
  );
  if (!mandateTenant && typeof prof.tenant_id === "string") {
    mandateTenant = prof.tenant_id.length > 0 ? prof.tenant_id : null;
  }

  if (ctx.isAdmin && body.assign_company_id !== undefined) {
    const raw = body.assign_company_id;
    if (raw === null || (typeof raw === "string" && !raw.trim())) {
      const { error: upErr } = await service
        .from("profiles")
        .update({
          company_id: null,
          tenant_id: null,
          location_id: null,
          updated_at: now,
        })
        .eq("id", idEq);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    } else if (typeof raw === "string" && raw.trim()) {
      const companyPk = raw.trim();
      const { data: coRow, error: coErr } = await service
        .from("companies")
        .select("id, tenant_id")
        .eq("id", companyPk)
        .maybeSingle();

      if (coErr || !coRow) {
        return NextResponse.json(
          { error: "Konzern (companies) nicht gefunden." },
          { status: 400 },
        );
      }

      const tenantId = (coRow as { tenant_id?: string | null }).tenant_id;
      if (typeof tenantId !== "string" || !tenantId.trim()) {
        return NextResponse.json(
          { error: "Konzern hat keine tenant_id." },
          { status: 400 },
        );
      }

      const prevCompany =
        typeof prof.company_id === "string" ? prof.company_id.trim() : "";
      const companyChanged = prevCompany !== companyPk;

      const patch: Record<string, unknown> = {
        company_id: companyPk,
        tenant_id: tenantId.trim(),
        updated_at: now,
      };
      if (companyChanged) {
        patch.location_id = null;
      }

      const { error: upErr } = await service
        .from("profiles")
        .update(patch)
        .eq("id", idEq);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }
  }

  let pAfter = await currentProfile();
  mandateTenant = await tenantForProfileCompany(service, pAfter?.company_id);
  if (!mandateTenant && typeof pAfter?.tenant_id === "string") {
    mandateTenant =
      pAfter.tenant_id.length > 0 ? pAfter.tenant_id : null;
  }

  if (body.location_id !== undefined) {
    pAfter = await currentProfile();
    mandateTenant = await tenantForProfileCompany(service, pAfter?.company_id);
    if (!mandateTenant && typeof pAfter?.tenant_id === "string") {
      mandateTenant =
        pAfter.tenant_id.length > 0 ? pAfter.tenant_id : null;
    }

    const locVal = body.location_id;

    if (locVal === null) {
      const { error: upErr } = await service
        .from("profiles")
        .update({ location_id: null, updated_at: now })
        .eq("id", idEq);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    } else if (typeof locVal === "string" && locVal.trim()) {
      if (!mandateTenant) {
        return NextResponse.json(
          {
            error:
              "Dem Nutzer fehlt ein Mandant: bitte zuerst einen Konzern zuweisen.",
          },
          { status: 400 },
        );
      }
      const { data: loc, error: locErr } = await service
        .from("locations")
        .select("company_id")
        .eq("id", locVal.trim())
        .maybeSingle();

      if (locErr || !loc) {
        return NextResponse.json(
          { error: "Standort nicht gefunden." },
          { status: 400 },
        );
      }
      const locTenant = (loc as { company_id?: string }).company_id;
      if (locTenant !== mandateTenant) {
        return NextResponse.json(
          {
            error:
              "Standort passt nicht zum Mandanten des gewählten Konzerns.",
          },
          { status: 400 },
        );
      }
      if (!ctx.isAdmin && ctx.tenantId && locTenant !== ctx.tenantId) {
        return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
      }

      const { error: upErr } = await service
        .from("profiles")
        .update({
          location_id: locVal.trim(),
          tenant_id: locTenant,
          updated_at: now,
        })
        .eq("id", idEq);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }
  }

  if (body.role !== undefined) {
    const wr = body.role;
    if (wr !== "mitarbeiter" && wr !== "manager" && wr !== "admin") {
      return NextResponse.json({ error: "Ungültige Rolle." }, { status: 400 });
    }

    pAfter = await currentProfile();
    mandateTenant = await tenantForProfileCompany(service, pAfter?.company_id);
    if (!mandateTenant && typeof pAfter?.tenant_id === "string") {
      mandateTenant =
        pAfter.tenant_id.length > 0 ? pAfter.tenant_id : null;
    }

    const { data: coRow } = await service
      .from("companies")
      .select("role")
      .eq("user_id", idEq)
      .maybeSingle();

    const coRole = normalizeDbRole(
      (coRow as { role?: unknown } | null)?.role,
    );
    if (!ctx.isAdmin && coRole === "admin") {
      return NextResponse.json(
        {
          error:
            "Die Rolle dieses Nutzers kann nur von Admins geändert werden.",
        },
        { status: 403 },
      );
    }

    const dbRole = wr === "admin" ? "admin" : wr === "manager" ? "manager" : "user";
    const needsSubscription = wr === "manager";

    if (!mandateTenant) {
      return NextResponse.json(
        {
          error:
            "Nutzer braucht profiles.company_id (Konzern), bevor eine Firmenrolle gesetzt werden kann.",
        },
        { status: 400 },
      );
    }

    const { data: existingCo } = await service
      .from("companies")
      .select("user_id")
      .eq("user_id", idEq)
      .maybeSingle();

    if (existingCo) {
      const { error: upErr } = await service
        .from("companies")
        .update({
          role: dbRole,
          ...(needsSubscription ? { is_subscribed: true } : {}),
        })
        .eq("user_id", idEq);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    } else {
      const { data: authU, error: authErr } =
        await service.auth.admin.getUserById(idEq);
      if (authErr || !authU?.user) {
        return NextResponse.json(
          { error: "Auth-Nutzer nicht gefunden." },
          { status: 400 },
        );
      }
      const meta = authU.user.user_metadata as Record<string, unknown> | null;
      const fn = String(meta?.first_name ?? meta?.firstName ?? "").trim();
      const ln = String(meta?.last_name ?? meta?.lastName ?? "").trim();
      const displayName =
        [fn, ln].filter(Boolean).join(" ").trim() ||
        authU.user.email?.trim() ||
        "Mitarbeiter";

      const { error: insErr } = await service.from("companies").insert({
        user_id: idEq,
        name: displayName.slice(0, 512),
        role: dbRole,
        is_subscribed: needsSubscription,
        tenant_id: mandateTenant,
      });

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    const profileRole = wr === "admin" ? "admin" : wr === "manager" ? "manager" : "user";
    const { error: profileErr } = await service
      .from("profiles")
      .update({ role: profileRole, updated_at: now })
      .eq("id", idEq);
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }
  }

  // --- Manager: Auth-Account bearbeiten (E-Mail, Name, Passwort reset) ---
  if (
    body.email !== undefined ||
    body.first_name !== undefined ||
    body.last_name !== undefined ||
    body.password !== undefined ||
    body.reset_password === true
  ) {
    // Manager darf nur innerhalb des eigenen Konzerns ändern (gleiche Prüfung wie oben über profiles.company_id).
    const nextEmail = body.email !== undefined ? cleanText(body.email).toLowerCase() : null;
    if (nextEmail !== null && (!nextEmail || !isEmail(nextEmail))) {
      return NextResponse.json({ error: "Ungültige E-Mail." }, { status: 400 });
    }
    const firstName = body.first_name !== undefined ? cleanText(body.first_name) : null;
    const lastName = body.last_name !== undefined ? cleanText(body.last_name) : null;

    const newPasswordRaw =
      body.reset_password === true
        ? generateTempPassword()
        : body.password !== undefined
          ? cleanText(body.password)
          : "";

    if (body.password !== undefined && newPasswordRaw.trim().length < 8) {
      return NextResponse.json(
        { error: "Passwort muss mindestens 8 Zeichen haben." },
        { status: 400 },
      );
    }

    const metaPatch: Record<string, unknown> = {};
    if (firstName !== null) metaPatch.first_name = firstName || undefined;
    if (lastName !== null) metaPatch.last_name = lastName || undefined;

    type AuthPatch = {
      email?: string;
      password?: string;
      user_metadata?: Record<string, unknown>;
    };
    const authPatch: AuthPatch = {};
    if (nextEmail !== null) authPatch.email = nextEmail;
    if (Object.keys(metaPatch).length > 0) authPatch.user_metadata = metaPatch;
    if (newPasswordRaw) authPatch.password = newPasswordRaw;

    if (Object.keys(authPatch).length > 0) {
      const authUpd = await service.auth.admin.updateUserById(idEq, authPatch);
      if (authUpd.error) {
        return NextResponse.json(
          { error: authUpd.error.message ?? "Auth-Update fehlgeschlagen." },
          { status: 400 },
        );
      }
    }

    if (newPasswordRaw) {
      // Passwort-Reset erzwingt Wechsel beim nächsten Login in der Worker-App.
      const upd = await service
        .from("profiles")
        .update({ must_change_password: true, updated_at: now })
        .eq("id", idEq);
      if (upd.error?.message.includes("must_change_password")) {
        // ignore for legacy schemas
      } else if (upd.error) {
        return NextResponse.json({ error: upd.error.message }, { status: 500 });
      }
    }

    if (body.reset_password === true) {
      return NextResponse.json({ ok: true, temp_password: newPasswordRaw });
    }
  }

  if (body.must_change_password !== undefined) {
    const val = body.must_change_password === true;
    const upd = await service
      .from("profiles")
      .update({ must_change_password: val, updated_at: now })
      .eq("id", idEq);
    if (upd.error?.message.includes("must_change_password")) {
      // ignore legacy schemas
    } else if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const canDelete =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canDelete) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { userId: targetUserId } = await context.params;
  const idEq = (targetUserId ?? "").trim();
  if (!idEq) {
    return NextResponse.json({ error: "Nutzer-ID fehlt." }, { status: 400 });
  }

  // Schutz: Manager darf nur User aus eigenem Konzern löschen (über profiles.company_id, analog zu PATCH).
  if (!ctx.isAdmin) {
    const { data: meProf } = await ctx.service
      .from("profiles")
      .select("company_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    const managerCompanyId = (meProf as { company_id?: string | null } | null)?.company_id ?? null;

    const { data: prof } = await ctx.service
      .from("profiles")
      .select("company_id, role")
      .eq("id", idEq)
      .maybeSingle();
    const targetCompanyId = (prof as { company_id?: string | null } | null)?.company_id ?? null;
    const targetRole = normalizeDbRole((prof as { role?: unknown } | null)?.role);

    if (!managerCompanyId || targetCompanyId !== managerCompanyId) {
      return NextResponse.json({ error: "Nutzer gehört nicht zu Ihrem Konzern." }, { status: 403 });
    }
    if (targetRole === "admin") {
      return NextResponse.json({ error: "Admins können hier nicht gelöscht werden." }, { status: 403 });
    }
  }

  const del = await ctx.service.auth.admin.deleteUser(idEq);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 400 });
  }

  // Best-effort cleanup
  void ctx.service.from("profiles").delete().eq("id", idEq);
  void ctx.service.from("companies").delete().eq("user_id", idEq);

  return NextResponse.json({ ok: true });
}
