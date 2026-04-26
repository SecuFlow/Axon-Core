import { NextRequest, NextResponse } from "next/server";
import { normalizeDbRole } from "@/lib/adminAccess";
import { logEvent } from "@/lib/auditLog";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["accounting", "machines", "crm", "other"] as const);
const STATUSES = new Set(["connected", "paused", "error"] as const);

type Category = "accounting" | "machines" | "crm" | "other";
type Status = "connected" | "paused" | "error";

function cleanText(v: unknown, max = 400): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function pickCategory(v: unknown): Category | null {
  const s = cleanText(v, 40).toLowerCase();
  return CATEGORIES.has(s as Category) ? (s as Category) : null;
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

/**
 * Liste aller Integrationen des Mandanten.
 * Admins sehen alles; Manager nur eigenen Mandanten.
 */
export async function GET() {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { service } = ctx;
  const actorMandantId = ctx.isAdmin
    ? null
    : await resolveActorMandantId(service, ctx.userId);

  if (!ctx.isAdmin && !actorMandantId) {
    return NextResponse.json({ error: "Kein Mandanten-Kontext." }, { status: 403 });
  }

  const baseSelect =
    "id, mandant_id, company_id, category, provider, display_name, status, api_endpoint, api_key_hint, notes, meta, created_at, updated_at, last_sync_at";

  const filtered =
    !ctx.isAdmin && actorMandantId
      ? service
          .from("integrations")
          .select(baseSelect)
          .eq("mandant_id", actorMandantId)
      : service.from("integrations").select(baseSelect);

  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (error.message.toLowerCase().includes('relation "public.integrations"')) {
      return NextResponse.json({
        items: [],
        migration_required: true,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as IntegrationRow[]).map(serialize);
  return NextResponse.json({ items });
}

/**
 * Neue Integration anlegen.
 * Manager: nur eigener Mandant; Admin: beliebiger Mandant via body.mandant_id.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const canWrite =
    ctx.isAdmin || normalizeDbRole(ctx.companyRole) === "manager";
  if (!canWrite) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const category = pickCategory(b.category);
  const provider = cleanText(b.provider, 80);
  const displayName = cleanText(b.display_name, 120) || null;
  const apiEndpoint = cleanText(b.api_endpoint, 400) || null;
  const apiKey = cleanText(b.api_key, 400);
  const notes = cleanText(b.notes, 600) || null;
  const status = pickStatus(b.status) ?? "connected";

  if (!category) {
    return NextResponse.json(
      { error: "category muss accounting, machines, crm oder other sein." },
      { status: 400 },
    );
  }
  if (!provider) {
    return NextResponse.json({ error: "provider fehlt." }, { status: 400 });
  }

  const mandantFromBody = cleanText(b.mandant_id, 80);
  const mandantId = ctx.isAdmin
    ? mandantFromBody || null
    : await resolveActorMandantId(ctx.service, ctx.userId);

  if (!mandantId) {
    return NextResponse.json(
      { error: "Kein Mandanten-Kontext (mandant_id)." },
      { status: 403 },
    );
  }

  const { data: companyRow } = await ctx.service
    .from("companies")
    .select("id")
    .eq("tenant_id", mandantId)
    .maybeSingle();
  const companyId =
    (companyRow as { id?: string } | null)?.id ?? null;

  const insertPayload: Record<string, unknown> = {
    mandant_id: mandantId,
    company_id: companyId,
    category,
    provider,
    display_name: displayName,
    status,
    api_endpoint: apiEndpoint,
    api_key_hint: buildApiKeyHint(apiKey),
    notes,
    created_by: ctx.userId,
  };

  const { data, error } = await ctx.service
    .from("integrations")
    .insert(insertPayload)
    .select(
      "id, mandant_id, company_id, category, provider, display_name, status, api_endpoint, api_key_hint, notes, meta, created_at, updated_at, last_sync_at",
    )
    .maybeSingle();

  if (error) {
    if (error.message.toLowerCase().includes('relation "public.integrations"')) {
      return NextResponse.json(
        { error: "Migration `integrations` nicht in Produktion aktiv." },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void logEvent(
    "integration.created",
    `Integration angelegt (${category} · ${provider}).`,
    { category, provider, display_name: displayName, status },
    {
      service: ctx.service,
      userId: ctx.userId,
      companyId,
      tenantId: mandantId,
    },
  );

  return NextResponse.json(
    { item: data ? serialize(data as IntegrationRow) : null },
    { status: 201 },
  );
}
