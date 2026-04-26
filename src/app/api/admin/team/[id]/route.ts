import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { applyMandantFilter } from "@/lib/mandantScope";
import { resolvePublicTeamScopeMandant } from "@/lib/siteTeamScope";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanId(raw: string): string {
  return String(raw ?? "").trim();
}

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanOptionalText(v: unknown): string | null {
  const t = cleanText(v);
  return t ? t : null;
}

function cleanSortOrder(v: unknown): number | null {
  if (v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10000, Math.trunc(n)));
}

function normalizeTeamRole(raw: unknown): "admin" | "mitarbeiter" | "manager" | null {
  const v = cleanText(raw).toLowerCase();
  if (v === "admin") return "admin";
  if (v === "manager") return "manager";
  if (v === "mitarbeiter" || v === "worker" || v === "user" || v === "employee") {
    return "mitarbeiter";
  }
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;
  const scope = await resolvePublicTeamScopeMandant(ctx.service, ctx.actorId);
  if (!scope) {
    return NextResponse.json({ error: "Keine Mandanten-Zuordnung." }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const scopeMandant = scope.scopeMandant;

  const { id } = await params;
  const teamId = cleanId(id);
  if (!teamId) {
    return NextResponse.json({ error: "Ungültige ID." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const name = b.name === undefined ? undefined : cleanText(b.name);
  const role =
    b.role === undefined ? undefined : normalizeTeamRole(b.role);
  const email = b.email === undefined ? undefined : cleanOptionalText(b.email);
  const phone = b.phone === undefined ? undefined : cleanOptionalText(b.phone);
  const photo_url =
    b.photo_url === undefined ? undefined : cleanOptionalText(b.photo_url);
  const public_title =
    b.public_title === undefined ? undefined : cleanOptionalText(b.public_title);
  const is_public =
    b.is_public === undefined
      ? undefined
      : typeof b.is_public === "boolean"
        ? b.is_public
        : null;
  const sort_order = cleanSortOrder(b.sort_order);

  if (name !== undefined && !name) {
    return NextResponse.json({ error: "Name darf nicht leer sein." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (b.role !== undefined && role === null && public_title === undefined) {
    return NextResponse.json(
      { error: "Rolle muss Admin, Mitarbeiter oder Manager sein." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (role !== undefined) patch.role = role;
  if (public_title !== undefined) patch.public_title = public_title;
  if (email !== undefined) patch.email = email;
  if (phone !== undefined) patch.phone = phone;
  if (photo_url !== undefined) patch.photo_url = photo_url;
  if (is_public !== undefined && is_public !== null) patch.is_public = is_public;
  if (sort_order !== null) patch.sort_order = sort_order;

  const upQuery = applyMandantFilter(
    ctx.service.from("team_members").update(patch).eq("id", teamId),
    scopeMandant,
  );
  let up = await upQuery
    .select(
      "id,name,role,public_title,is_public,email,phone,photo_url,sort_order,created_at,updated_at",
    )
    .single();
  if (up.error?.message.includes("public_title")) {
    const fb = { ...patch };
    delete fb.public_title;
    const fallbackQuery = applyMandantFilter(
      ctx.service.from("team_members").update(fb).eq("id", teamId),
      scopeMandant,
    );
    up = await fallbackQuery
      .select("id,name,role,is_public,email,phone,photo_url,sort_order,created_at,updated_at")
      .single();
  }
  if (up.error?.message.includes("is_public")) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.is_public;
    delete fallbackPatch.public_title;
    const fallbackQuery = applyMandantFilter(
      ctx.service.from("team_members").update(fallbackPatch).eq("id", teamId),
      scopeMandant,
    );
    up = await fallbackQuery
      .select("id,name,role,email,phone,photo_url,sort_order,created_at,updated_at")
      .single();
  }

  if (up.error || !up.data) {
    return NextResponse.json(
      { error: up.error?.message ?? "Update fehlgeschlagen." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ item: up.data }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;
  const scope = await resolvePublicTeamScopeMandant(ctx.service, ctx.actorId);
  if (!scope) {
    return NextResponse.json({ error: "Keine Mandanten-Zuordnung." }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const scopeMandant = scope.scopeMandant;

  const { id } = await params;
  const teamId = cleanId(id);
  if (!teamId) {
    return NextResponse.json({ error: "Ungültige ID." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const delQuery = applyMandantFilter(
    ctx.service.from("team_members").delete().eq("id", teamId),
    scopeMandant,
  );
  const del = await delQuery;
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

