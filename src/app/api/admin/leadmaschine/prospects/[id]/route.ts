import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type Params = { params: Promise<{ id: string }> };

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function sanitizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

export async function PATCH(request: NextRequest, ctx2: Params) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }
  const { id } = await ctx2.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: "Ungültige ID." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let body: {
    action?: unknown;
    notes?: unknown;
    domain?: unknown;
    manager_name?: unknown;
    corporate_group_name?: unknown;
    location_name?: unknown;
    department?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  // Action-based status transitions
  if (typeof body.action === "string") {
    const action = body.action.toLowerCase();
    if (action === "mark_connected") {
      update.status = "connected";
      update.connected_at = now;
    } else if (action === "mark_prospect") {
      update.status = "prospect";
      update.connected_at = null;
    } else if (action === "skip") {
      update.status = "skipped";
      update.skipped_at = now;
    } else if (action === "unskip") {
      update.status = "prospect";
      update.skipped_at = null;
    } else {
      return NextResponse.json(
        { error: "Unbekannte Aktion." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
  }

  // Field updates
  if (typeof body.notes === "string") update.notes = body.notes.slice(0, 2048);
  if (typeof body.manager_name === "string") {
    const v = body.manager_name.trim();
    if (v) update.manager_name = v.slice(0, 256);
  }
  if (typeof body.corporate_group_name === "string")
    update.corporate_group_name = body.corporate_group_name.trim().slice(0, 256) || null;
  if (typeof body.location_name === "string")
    update.location_name = body.location_name.trim().slice(0, 256) || null;
  if (typeof body.department === "string")
    update.department = body.department.trim().slice(0, 128) || null;
  if (typeof body.domain === "string") {
    const d = sanitizeDomain(body.domain);
    update.domain = d;
  }

  if (Object.keys(update).length <= 1) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const upd = await ctx.service
    .from("linkedin_prospects")
    .update(update)
    .eq("id", id);

  if (upd.error) {
    return NextResponse.json(
      { error: upd.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(_request: NextRequest, ctx2: Params) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }
  const { id } = await ctx2.params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: "Ungültige ID." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const del = await ctx.service.from("linkedin_prospects").delete().eq("id", id);
  if (del.error) {
    return NextResponse.json(
      { error: del.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
