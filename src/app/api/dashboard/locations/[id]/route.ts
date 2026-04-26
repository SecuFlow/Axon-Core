import { NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadProfileRole(
  service: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await service
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return normalizeDbRole((data as { role?: unknown } | null)?.role);
}

/**
 * Standort löschen: Plattform-/Konzern-Admin beliebig; Manager nur eigener Mandant (tenant).
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { id } = await context.params;
  const locId = (id ?? "").trim();
  if (!locId) {
    return NextResponse.json({ error: "Standort-ID fehlt." }, { status: 400 });
  }

  const profRole = await loadProfileRole(ctx.service, ctx.userId);
  const isProfileManager = profRole === "manager";
  const companyRoleNorm = normalizeDbRole(ctx.companyRole);
  const platformScopedDelete = ctx.isAdmin && !isProfileManager;
  const managerScopedDelete =
    (isProfileManager ||
      (!ctx.isAdmin && companyRoleNorm === "manager")) &&
    ctx.tenantId != null;
  const mandateAdminScopedDelete =
    !ctx.isAdmin &&
    ctx.tenantId != null &&
    companyRoleNorm === "admin";

  if (
    !platformScopedDelete &&
    !managerScopedDelete &&
    !mandateAdminScopedDelete
  ) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { data: row, error: fetchErr } = await ctx.service
    .from("locations")
    .select("id, company_id")
    .eq("id", locId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  const loc = row as { id?: string; company_id?: string } | null;
  if (!loc?.id) {
    return NextResponse.json({ error: "Standort nicht gefunden." }, { status: 404 });
  }

  const tenantBoundDelete = managerScopedDelete || mandateAdminScopedDelete;
  if (tenantBoundDelete && ctx.tenantId && loc.company_id !== ctx.tenantId) {
    return NextResponse.json(
      { error: "Standort gehört nicht zu Ihrem Konzern." },
      { status: 403 },
    );
  }

  const { error } = await ctx.service.from("locations").delete().eq("id", locId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
