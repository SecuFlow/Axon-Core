import { NextRequest, NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { logEvent } from "@/lib/auditLog";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["connected", "paused", "error"] as const);
type Status = "connected" | "paused" | "error";

function cleanText(v: unknown, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function pickStatus(v: unknown): Status | null {
  const s = cleanText(v, 40).toLowerCase();
  return STATUSES.has(s as Status) ? (s as Status) : null;
}

function buildApiKeyHint(raw: unknown): string | null {
  const s = cleanText(raw, 2000);
  if (!s) return null;
  if (s.length <= 8) return `•••${s.slice(-2)}`;
  return `${s.slice(0, 2)}•••${s.slice(-4)}`;
}

type IntegrationRow = {
  id: string;
  mandant_id: string;
  company_id: string | null;
  category: string;
  provider: string;
  display_name: string | null;
  status: string;
  api_endpoint: string | null;
  api_key_hint: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_sync_at: string | null;
  meta: Record<string, unknown> | null;
};

function serialize(row: IntegrationRow) {
  return {
    id: row.id,
    mandant_id: row.mandant_id,
    company_id: row.company_id,
    category: row.category,
    provider: row.provider,
    display_name: row.display_name,
    status: row.status,
    api_endpoint: row.api_endpoint,
    api_key_hint: row.api_key_hint,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_sync_at: row.last_sync_at,
    meta: row.meta ?? {},
  };
}

async function ensureScopedRow(
  ctx: Extract<
    Awaited<ReturnType<typeof requireKonzernTenantContext>>,
    { ok: true }
  >,
  id: string,
): Promise<
  | { ok: true; row: IntegrationRow; mandantId: string }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await ctx.service
    .from("integrations")
    .select(
      "id, mandant_id, company_id, category, provider, display_name, status, api_endpoint, api_key_hint, notes, meta, created_at, updated_at, last_sync_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Integration nicht gefunden." };
  }

  const row = data as IntegrationRow;

  if (!ctx.isAdmin) {
    const actorMandantId = await resolveActorMandantId(ctx.service, ctx.userId);
    if (!actorMandantId || actorMandantId !== row.mandant_id) {
      return { ok: false, status: 403, error: "Kein Zugriff." };
    }
  }

  return { ok: true, row, mandantId: row.mandant_id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const canWrite =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canWrite) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }

  const scoped = await ensureScopedRow(ctx, id);
  if (!scoped.ok) {
    return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  if ("display_name" in b)
    patch.display_name = cleanText(b.display_name, 120) || null;
  if ("api_endpoint" in b)
    patch.api_endpoint = cleanText(b.api_endpoint, 400) || null;
  if ("notes" in b) patch.notes = cleanText(b.notes, 600) || null;

  const rawStatus = pickStatus(b.status);
  if ("status" in b && rawStatus) patch.status = rawStatus;

  if ("api_key" in b) {
    const hint = buildApiKeyHint(b.api_key);
    patch.api_key_hint = hint;
  }

  if ("last_sync_at" in b) {
    patch.last_sync_at = b.last_sync_at === null ? null : new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { item: serialize(scoped.row) },
      { status: 200 },
    );
  }

  const { data, error } = await ctx.service
    .from("integrations")
    .update(patch)
    .eq("id", id)
    .select(
      "id, mandant_id, company_id, category, provider, display_name, status, api_endpoint, api_key_hint, notes, meta, created_at, updated_at, last_sync_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void logEvent(
    "integration.updated",
    `Integration aktualisiert (${scoped.row.category} · ${scoped.row.provider}).`,
    { patch },
    {
      service: ctx.service,
      userId: ctx.userId,
      companyId: scoped.row.company_id,
      tenantId: scoped.mandantId,
    },
  );

  return NextResponse.json({
    item: data ? serialize(data as IntegrationRow) : null,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const canWrite =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canWrite) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id fehlt." }, { status: 400 });
  }

  const scoped = await ensureScopedRow(ctx, id);
  if (!scoped.ok) {
    return NextResponse.json({ error: scoped.error }, { status: scoped.status });
  }

  const { error } = await ctx.service
    .from("integrations")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void logEvent(
    "integration.deleted",
    `Integration entfernt (${scoped.row.category} · ${scoped.row.provider}).`,
    { id },
    {
      service: ctx.service,
      userId: ctx.userId,
      companyId: scoped.row.company_id,
      tenantId: scoped.mandantId,
    },
  );

  return NextResponse.json({ ok: true });
}
