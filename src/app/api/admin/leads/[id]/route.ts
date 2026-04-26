import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function isValidLinkedIn(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/(in|pub|company)\/[^\s]+/i.test(s);
}

function normalizeLinkedIn(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/+/, "")}`;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const leadId = (id ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "Lead-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const del = await ctx.service.from("leads").delete().eq("id", leadId);
  if (del.error) {
    if (del.error.message.includes("leads")) {
      return NextResponse.json({ error: "Lead-Tabelle fehlt." }, { status: 503, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: del.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

const UPDATABLE_STRING_FIELDS: Array<{
  key: string;
  maxLen: number;
  nullable: boolean;
}> = [
  { key: "notes", maxLen: 10_000, nullable: true },
  { key: "manager_name", maxLen: 256, nullable: false },
  { key: "corporate_group_name", maxLen: 256, nullable: false },
  { key: "location_name", maxLen: 256, nullable: false },
  { key: "phone", maxLen: 64, nullable: true },
  { key: "department", maxLen: 128, nullable: true },
  { key: "research_source", maxLen: 512, nullable: true },
  { key: "contact_email", maxLen: 320, nullable: false },
  { key: "domain", maxLen: 255, nullable: true },
  { key: "industry", maxLen: 128, nullable: true },
  { key: "market_segment", maxLen: 64, nullable: true },
  { key: "hq_location", maxLen: 1024, nullable: true },
];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const { id } = await context.params;
  const leadId = (id ?? "").trim();
  if (!leadId) {
    return NextResponse.json(
      { error: "Lead-ID fehlt." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const f of UPDATABLE_STRING_FIELDS) {
    if (!(f.key in b)) continue;
    const raw = b[f.key];
    if (raw === null) {
      if (f.nullable) patch[f.key] = null;
      continue;
    }
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, f.maxLen);
    if (!trimmed) {
      if (f.nullable) patch[f.key] = null;
      continue;
    }
    if (f.key === "contact_email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json(
        { error: "Ungültige Kontakt-E-Mail." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    patch[f.key] = trimmed;
  }

  if ("linkedin_url" in b) {
    const raw = b.linkedin_url;
    if (raw === null || raw === "") {
      // Nicht erlaubt, LinkedIn zu leeren (Pflichtfeld im UI). Ignorieren.
    } else if (typeof raw === "string") {
      if (!isValidLinkedIn(raw)) {
        return NextResponse.json(
          { error: "Ungültige LinkedIn-URL." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      patch.linkedin_url = normalizeLinkedIn(raw).slice(0, 512);
    }
  }

  for (const numKey of ["employee_count", "revenue_eur"] as const) {
    if (!(numKey in b)) continue;
    const raw = b[numKey];
    if (raw === null || raw === "") {
      patch[numKey] = null;
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) patch[numKey] = Math.round(n);
  }

  // Wenn Konzernname oder Standortname geändert wurden: company_name aktualisieren.
  if (
    typeof patch.corporate_group_name === "string" ||
    typeof patch.location_name === "string"
  ) {
    const curRes = await ctx.service
      .from("leads")
      .select("corporate_group_name, location_name, company_name")
      .eq("id", leadId)
      .maybeSingle();
    const cur = curRes.data as
      | {
          corporate_group_name?: string | null;
          location_name?: string | null;
          company_name?: string | null;
        }
      | null;
    const group =
      typeof patch.corporate_group_name === "string"
        ? patch.corporate_group_name
        : cur?.corporate_group_name ?? "";
    const loc =
      typeof patch.location_name === "string"
        ? patch.location_name
        : cur?.location_name ?? "";
    if (group && loc) {
      patch.company_name = `${group} – ${loc}`.slice(0, 512);
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Kein Patch-Feld angegeben." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  patch.updated_at = new Date().toISOString();

  let upd = await ctx.service
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .select("id, notes, manager_name, linkedin_url, corporate_group_name, location_name, phone, department, research_source")
    .maybeSingle();

  // Fallback: Wenn Migration noch nicht live, strippen wir die neuen Felder und versuchen nochmal.
  if (
    upd.error &&
    upd.error.message.toLowerCase().includes("column") &&
    upd.error.message.toLowerCase().includes("does not exist")
  ) {
    const legacyPatch: Record<string, unknown> = { ...patch };
    for (const k of [
      "manager_name",
      "linkedin_url",
      "corporate_group_name",
      "location_name",
      "phone",
      "department",
      "research_source",
    ]) {
      delete legacyPatch[k];
    }
    if (Object.keys(legacyPatch).length === 0 || (Object.keys(legacyPatch).length === 1 && legacyPatch.updated_at)) {
      return NextResponse.json(
        {
          error:
            "Leadmaschine-Migration ausstehend. Bitte 20260423222320_leadmaschine_manual_fields.sql ausführen.",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    upd = await ctx.service
      .from("leads")
      .update(legacyPatch)
      .eq("id", leadId)
      .select("id, notes")
      .maybeSingle();
  }

  if (upd.error) {
    return NextResponse.json(
      { error: upd.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, lead: upd.data ?? null }, { headers: NO_STORE_HEADERS });
}
