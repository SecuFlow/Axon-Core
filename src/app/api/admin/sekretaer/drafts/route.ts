import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function assertKind(raw: unknown): "mail_1" | "follow_up" | "demo" {
  if (raw === "mail_1" || raw === "follow_up" || raw === "demo") return raw;
  throw new Error("Ungültiger Typ.");
}

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const r = await ctx.service
    .from("lead_sequence_drafts")
    .select("id,created_at,updated_at,lead_id,kind,subject,body,status,approved_at,approved_by,pushed_at,pushed_by,metadata")
    .order("created_at", { ascending: false })
    .limit(50);

  if (r.error) {
    return NextResponse.json({ error: r.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ items: r.data ?? [] }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const lead_id = cleanText(b.lead_id);
  const subject = cleanText(b.subject);
  const content = cleanText(b.body);

  let kind: "mail_1" | "follow_up" | "demo";
  try {
    kind = assertKind(b.kind);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ungültiger Typ." },
      { status: 400 },
    );
  }

  if (!lead_id) {
    return NextResponse.json({ error: "Lead-ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (!subject) {
    return NextResponse.json(
      { error: "Betreff ist erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!content) {
    return NextResponse.json({ error: "Body ist erforderlich." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const ins = await ctx.service
    .from("lead_sequence_drafts")
    .insert({
      lead_id,
      kind,
      subject,
      body: content,
      status: "draft",
      updated_at: new Date().toISOString(),
      metadata: { actor: ctx.actorId },
    })
    .select("id,created_at,updated_at,lead_id,kind,subject,body,status,approved_at,approved_by,pushed_at,pushed_by,metadata")
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json(
      { error: ins.error?.message ?? "Draft konnte nicht gespeichert werden." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ item: ins.data }, { headers: NO_STORE_HEADERS });
}

