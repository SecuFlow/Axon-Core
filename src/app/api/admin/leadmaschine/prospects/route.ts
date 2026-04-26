import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

type ProspectRow = {
  id: string;
  created_at: string;
  updated_at: string;
  target_id: string | null;
  industry: string | null;
  city: string | null;
  corporate_group_name: string | null;
  location_name: string | null;
  manager_name: string;
  linkedin_url: string;
  department: string | null;
  notes: string | null;
  status: string;
  domain: string | null;
  generated_email: string | null;
  generated_email_patterns: unknown;
  promoted_lead_id: string | null;
  connected_at: string | null;
  promoted_at: string | null;
  skipped_at: string | null;
};

const SELECT_COLUMNS =
  "id, created_at, updated_at, target_id, industry, city, corporate_group_name, location_name, manager_name, linkedin_url, department, notes, status, domain, generated_email, generated_email_patterns, promoted_lead_id, connected_at, promoted_at, skipped_at";

function isTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("42p01");
}

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        "linkedin_prospects-Tabelle fehlt. Bitte Migration 20260424000000_leadmaschine_linkedin_ecosystem.sql ausführen.",
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

function normalizeLinkedIn(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

function isValidLinkedIn(raw: string): boolean {
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|pub)\/[^\s]+/i.test(raw.trim());
}

function sanitizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

export async function GET(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const statusFilter = (request.nextUrl.searchParams.get("status") ?? "").trim().toLowerCase();
  let q = ctx.service
    .from("linkedin_prospects")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);

  if (
    statusFilter === "prospect" ||
    statusFilter === "connected" ||
    statusFilter === "promoted" ||
    statusFilter === "skipped"
  ) {
    q = q.eq("status", statusFilter);
  }

  const res = await q;
  if (res.error) {
    if (isTableMissingError(res.error.message)) return tableMissingResponse();
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const prospects = (res.data ?? []).map((r) => r as ProspectRow);
  return NextResponse.json({ prospects }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const manager_name = typeof body.manager_name === "string" ? body.manager_name.trim() : "";
  const linkedin_raw = typeof body.linkedin_url === "string" ? body.linkedin_url.trim() : "";
  const corporate_group_name =
    typeof body.corporate_group_name === "string" ? body.corporate_group_name.trim() : "";
  const location_name =
    typeof body.location_name === "string" ? body.location_name.trim() : "";
  const industry = typeof body.industry === "string" ? body.industry.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const domain_raw = typeof body.domain === "string" ? body.domain.trim() : "";
  const target_id = typeof body.target_id === "string" ? body.target_id.trim() : "";

  if (!manager_name) {
    return NextResponse.json(
      { error: "Manager-Name erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!linkedin_raw || !isValidLinkedIn(linkedin_raw)) {
    return NextResponse.json(
      { error: "Gültige LinkedIn-URL erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const linkedin_url = normalizeLinkedIn(linkedin_raw);
  const domain = domain_raw ? sanitizeDomain(domain_raw) : null;

  const payload: Record<string, unknown> = {
    manager_name: manager_name.slice(0, 256),
    linkedin_url: linkedin_url.slice(0, 512),
    corporate_group_name: corporate_group_name ? corporate_group_name.slice(0, 256) : null,
    location_name: location_name ? location_name.slice(0, 256) : null,
    industry: industry ? industry.slice(0, 128) : null,
    city: city ? city.slice(0, 128) : null,
    department: department ? department.slice(0, 128) : null,
    notes: notes ? notes.slice(0, 2048) : null,
    domain,
    target_id: target_id && /^[0-9a-f-]{36}$/i.test(target_id) ? target_id : null,
    status: "prospect",
  };

  const ins = await ctx.service
    .from("linkedin_prospects")
    .insert(payload)
    .select("id, linkedin_url")
    .single();

  if (ins.error) {
    if (isTableMissingError(ins.error.message)) return tableMissingResponse();
    if (ins.error.message.toLowerCase().includes("duplicate")) {
      return NextResponse.json(
        { error: "Dieses LinkedIn-Profil ist bereits in der Pipeline." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: ins.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, id: ins.data?.id ?? null },
    { headers: NO_STORE_HEADERS },
  );
}
