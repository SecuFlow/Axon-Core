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

  let body: { is_active?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;
  if (typeof body.notes === "string") update.notes = body.notes.slice(0, 1024);
  if (Object.keys(update).length <= 1) {
    return NextResponse.json(
      { error: "Keine Felder zum Aktualisieren." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const upd = await ctx.service
    .from("leadmaschine_targets")
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

  const del = await ctx.service.from("leadmaschine_targets").delete().eq("id", id);
  if (del.error) {
    return NextResponse.json(
      { error: del.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
