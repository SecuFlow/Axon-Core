import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { resolvePublicTeamScopeMandant } from "@/lib/siteTeamScope";
import { NO_STORE_HEADERS, PRIVATE_SWR_HEADERS } from "@/lib/httpCache";

export const dynamic = "force-dynamic";

/**
 * Modul-Level-Schema-Memo: nach dem ersten erfolgreichen Read wissen wir,
 * welche Spaltenkombination die DB unterstützt. Spätere Reads springen direkt
 * zum richtigen SELECT — spart pro Hot-Path-Request bis zu 5 sequenzielle
 * DB-Round-Trips für die Spalten-Probierschleife.
 */
type TeamMembersSchema = {
  scopeColumn: "mandant_id" | "tenant_id";
  hasPublicTitle: boolean;
  hasIsPublic: boolean;
};
let cachedTeamMembersSchema: TeamMembersSchema | null = null;

export type TeamMemberRow = {
  id: string;
  name: string;
  role: string;
  public_title?: string | null;
  is_public?: boolean;
  email?: string | null;
  phone?: string | null;
  photo_url?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function normalizeTeamRole(raw: unknown): "admin" | "mitarbeiter" | "manager" | null {
  const v = cleanText(raw).toLowerCase();
  if (v === "admin") return "admin";
  if (v === "manager") return "manager";
  if (v === "mitarbeiter" || v === "worker" || v === "user" || v === "employee") {
    return "mitarbeiter";
  }
  return null;
}

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function cleanOptionalText(v: unknown): string | null {
  const t = cleanText(v);
  return t ? t : null;
}

function cleanSortOrder(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(10000, Math.trunc(n)));
}

function buildTeamSelect(schema: TeamMembersSchema): string {
  const cols = ["id", "name", "role"];
  if (schema.hasPublicTitle) cols.push("public_title");
  if (schema.hasIsPublic) cols.push("is_public");
  cols.push("email", "phone", "photo_url", "sort_order", "created_at", "updated_at");
  return cols.join(",");
}

async function selectTeamMembers(
  service: import("@supabase/supabase-js").SupabaseClient,
  scopeMandant: string,
  schema: TeamMembersSchema,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const r = await service
    .from("team_members")
    .select(buildTeamSelect(schema))
    .eq(schema.scopeColumn, scopeMandant)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return { data: r.data, error: r.error };
}

/**
 * Probiert alle Schema-Varianten in der bekannten Reihenfolge — beim ersten
 * Erfolg wird das Schema im Modul-Cache gemerkt, damit weitere Requests in
 * derselben Server-Instanz direkt mit dem richtigen SELECT starten.
 */
async function selectTeamMembersWithSchemaProbe(
  service: import("@supabase/supabase-js").SupabaseClient,
  scopeMandant: string,
): Promise<{ data: unknown; error: { message: string } | null }> {
  if (cachedTeamMembersSchema) {
    const r = await selectTeamMembers(service, scopeMandant, cachedTeamMembersSchema);
    if (!r.error) return r;
    // Schema-Drift (Migration durchgelaufen?) → Cache verwerfen, neu probieren.
    cachedTeamMembersSchema = null;
  }

  const probes: TeamMembersSchema[] = [
    { scopeColumn: "mandant_id", hasPublicTitle: true, hasIsPublic: true },
    { scopeColumn: "tenant_id", hasPublicTitle: true, hasIsPublic: true },
    { scopeColumn: "mandant_id", hasPublicTitle: false, hasIsPublic: true },
    { scopeColumn: "tenant_id", hasPublicTitle: false, hasIsPublic: true },
    { scopeColumn: "mandant_id", hasPublicTitle: false, hasIsPublic: false },
    { scopeColumn: "tenant_id", hasPublicTitle: false, hasIsPublic: false },
  ];

  let last: { data: unknown; error: { message: string } | null } = {
    data: null,
    error: { message: "kein Probe ausgeführt" },
  };
  for (const probe of probes) {
    last = await selectTeamMembers(service, scopeMandant, probe);
    if (!last.error) {
      cachedTeamMembersSchema = probe;
      return last;
    }
    const msg = last.error.message ?? "";
    // Fehler an völlig unbekannter Stelle → Cache nicht setzen, raus.
    if (
      !msg.includes("mandant_id") &&
      !msg.includes("tenant_id") &&
      !msg.includes("public_title") &&
      !msg.includes("is_public")
    ) {
      return last;
    }
  }
  return last;
}

export async function GET() {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;
  const scope = await resolvePublicTeamScopeMandant(ctx.service, ctx.actorId);
  if (!scope) {
    return NextResponse.json(
      { error: "Keine Mandanten-Zuordnung für den Nutzer." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  const scopeMandant = scope.scopeMandant;

  const r = await selectTeamMembersWithSchemaProbe(ctx.service, scopeMandant);

  if (r.error) {
    if (r.error.message.includes("team_members")) {
      return NextResponse.json(
        { items: [] as TeamMemberRow[], warning: "team_members fehlt — Migration ausführen." },
        { headers: PRIVATE_SWR_HEADERS },
      );
    }
    return NextResponse.json({ error: r.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json(
    { items: (r.data ?? []) as TeamMemberRow[] },
    { headers: PRIVATE_SWR_HEADERS },
  );
}

export async function POST(req: Request) {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;
  const scope = await resolvePublicTeamScopeMandant(ctx.service, ctx.actorId);
  if (!scope) {
    return NextResponse.json(
      { error: "Keine Mandanten-Zuordnung für den Nutzer." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  const scopeMandant = scope.scopeMandant;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const name = cleanText(b.name);
  const publicTitle = cleanOptionalText(b.public_title);
  const roleNorm = normalizeTeamRole(b.role);
  const email = cleanOptionalText(b.email);
  const phone = cleanOptionalText(b.phone);
  const photo_url = cleanOptionalText(b.photo_url);
  const is_public = typeof b.is_public === "boolean" ? b.is_public : false;
  const sort_order = cleanSortOrder(b.sort_order);

  if (!name) {
    return NextResponse.json({ error: "Name ist erforderlich." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const workforceRole = publicTitle ? ("mitarbeiter" as const) : roleNorm;
  if (!workforceRole) {
    return NextResponse.json(
      { error: "Rolle muss Admin, Mitarbeiter oder Manager sein — oder Position (öffentlich) angeben." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let ins: {
    data: unknown;
    error: { message: string } | null;
  } = await ctx.service
    .from("team_members")
    .insert({
      mandant_id: scopeMandant,
      tenant_id: scopeMandant,
      name,
      role: workforceRole,
      public_title: publicTitle,
      is_public,
      email,
      phone,
      photo_url,
      sort_order,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id,name,role,public_title,is_public,email,phone,photo_url,sort_order,created_at,updated_at",
    )
    .single();
  if (ins.error?.message.includes("mandant_id")) {
    ins = await ctx.service
      .from("team_members")
      .insert({
        tenant_id: scopeMandant,
        name,
        role: workforceRole,
        public_title: publicTitle,
        is_public,
        email,
        phone,
        photo_url,
        sort_order,
        updated_at: new Date().toISOString(),
      })
      .select(
        "id,name,role,public_title,is_public,email,phone,photo_url,sort_order,created_at,updated_at",
      )
      .single();
  }
  if (ins.error?.message.includes("public_title")) {
    ins = await ctx.service
      .from("team_members")
      .insert({
        mandant_id: scopeMandant,
        tenant_id: scopeMandant,
        name,
        role: workforceRole,
        is_public,
        email,
        phone,
        photo_url,
        sort_order,
        updated_at: new Date().toISOString(),
      })
      .select("id,name,role,is_public,email,phone,photo_url,sort_order,created_at,updated_at")
      .single();
    if (ins.error?.message.includes("mandant_id")) {
      ins = await ctx.service
        .from("team_members")
        .insert({
          tenant_id: scopeMandant,
          name,
          role: workforceRole,
          is_public,
          email,
          phone,
          photo_url,
          sort_order,
          updated_at: new Date().toISOString(),
        })
        .select("id,name,role,is_public,email,phone,photo_url,sort_order,created_at,updated_at")
        .single();
    }
  }
  if (ins.error?.message.includes("is_public")) {
    ins = await ctx.service
      .from("team_members")
      .insert({
        mandant_id: scopeMandant,
        tenant_id: scopeMandant,
        name,
        role: workforceRole,
        email,
        phone,
        photo_url,
        sort_order,
        updated_at: new Date().toISOString(),
      })
      .select("id,name,role,email,phone,photo_url,sort_order,created_at,updated_at")
      .single();
    if (ins.error?.message.includes("mandant_id")) {
      ins = await ctx.service
        .from("team_members")
        .insert({
          tenant_id: scopeMandant,
          name,
          role: workforceRole,
          email,
          phone,
          photo_url,
          sort_order,
          updated_at: new Date().toISOString(),
        })
        .select("id,name,role,email,phone,photo_url,sort_order,created_at,updated_at")
        .single();
    }
  }

  if (ins.error || !ins.data) {
    return NextResponse.json(
      { error: ins.error?.message ?? "Teammitglied konnte nicht erstellt werden." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ item: ins.data as TeamMemberRow }, { headers: NO_STORE_HEADERS });
}

