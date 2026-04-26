import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

/**
 * Demo-Management: pro Firma Demo-Slug / CTA / Aktiv-Flag steuern.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const companyPk = (id ?? "").trim();
  if (!companyPk) {
    return NextResponse.json({ error: "Konzern-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let body: { show_cta?: unknown; demo_slug?: unknown; is_demo_active?: unknown };
  try {
    body = (await request.json()) as {
      show_cta?: unknown;
      demo_slug?: unknown;
      is_demo_active?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.show_cta === "boolean") update.show_cta = body.show_cta;
  if (typeof body.is_demo_active === "boolean")
    update.is_demo_active = body.is_demo_active;
  if (body.demo_slug === null) {
    update.demo_slug = null;
  } else if (typeof body.demo_slug === "string") {
    const s = body.demo_slug.trim().toLowerCase();
    update.demo_slug = s.length > 0 ? s.slice(0, 64) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Keine gültigen Felder im Body (show_cta, demo_slug, is_demo_active)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { error } = await ctx.service
    .from("companies")
    .update(update)
    .eq("id", companyPk);

  if (error) {
    if (
      (error.message.includes("demo_slug") ||
        error.message.includes("show_cta") ||
        error.message.includes("is_demo_active")) &&
      error.message.includes("schema cache")
    ) {
      return NextResponse.json(
        {
          error:
            "Supabase API Schema-Cache ist noch nicht aktualisiert (neue Spalten). Bitte 1–2 Minuten warten und erneut versuchen.",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

/**
 * Konzern löschen: zuerst Standorte des Mandanten (tenant_id),
 * Profil-Zuweisungen lösen, optional Maschinen; dann companies-Zeile.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const companyPk = (id ?? "").trim();
  if (!companyPk) {
    return NextResponse.json({ error: "Konzern-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const { data: row, error: fetchErr } = await ctx.service
    .from("companies")
    .select("id, tenant_id")
    .eq("id", companyPk)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  const co = row as { id?: string; tenant_id?: string | null } | null;
  if (!co?.id) {
    return NextResponse.json({ error: "Konzern nicht gefunden." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const tenantId =
    typeof co.tenant_id === "string" && co.tenant_id.length > 0
      ? co.tenant_id
      : null;

  if (tenantId) {
    const { error: locErr } = await ctx.service
      .from("locations")
      .delete()
      .eq("company_id", tenantId);
    if (locErr) {
      return NextResponse.json(
        { error: `Standorte: ${locErr.message}` },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const { error: machErr } = await ctx.service
      .from("machines")
      .delete()
      .eq("company_id", tenantId);
    if (
      machErr &&
      !machErr.message.includes("machines") &&
      !machErr.message.includes("does not exist")
    ) {
      return NextResponse.json(
        { error: `Maschinen: ${machErr.message}` },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  }

  const profileClear: Record<string, unknown> = {
    company_id: null,
    tenant_id: null,
  };
  const { error: profErr } = await ctx.service
    .from("profiles")
    .update({
      ...profileClear,
      location_id: null,
    })
    .eq("company_id", companyPk);

  if (
    profErr?.message.includes("location_id") ||
    profErr?.message.includes("schema cache")
  ) {
    const { error: profErr2 } = await ctx.service
      .from("profiles")
      .update(profileClear)
      .eq("company_id", companyPk);
    if (profErr2) {
      return NextResponse.json(
        { error: `Profile: ${profErr2.message}` },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
  } else if (profErr) {
    return NextResponse.json(
      { error: `Profile: ${profErr.message}` },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const { error: delErr } = await ctx.service
    .from("companies")
    .delete()
    .eq("id", companyPk);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
