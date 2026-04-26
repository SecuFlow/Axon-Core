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

function cleanId(raw: string): string {
  return String(raw ?? "").trim();
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const draftId = cleanId(id);
  if (!draftId) {
    return NextResponse.json({ error: "ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const subject = b.subject === undefined ? undefined : cleanText(b.subject);
  const content = b.body === undefined ? undefined : cleanText(b.body);
  const status = b.status === undefined ? undefined : cleanText(b.status);

  if (subject !== undefined && !subject) {
    return NextResponse.json(
      { error: "Betreff darf nicht leer sein." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (content !== undefined && !content) {
    return NextResponse.json(
      { error: "Body darf nicht leer sein." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (subject !== undefined) patch.subject = subject;
  if (content !== undefined) patch.body = content;

  if (status) {
    if (status !== "draft" && status !== "approved" && status !== "pushed") {
      return NextResponse.json(
        { error: "Ungültiger Status." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    patch.status = status;
    if (status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = ctx.actorId;
    }
  }

  const up = await ctx.service
    .from("lead_sequence_drafts")
    .update(patch)
    .eq("id", draftId)
    .select("id,created_at,updated_at,lead_id,kind,subject,body,status,approved_at,approved_by,pushed_at,pushed_by,metadata")
    .single();

  if (up.error || !up.data) {
    return NextResponse.json(
      { error: up.error?.message ?? "Update fehlgeschlagen." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ item: up.data }, { headers: NO_STORE_HEADERS });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  const { id } = await context.params;
  const draftId = cleanId(id);
  if (!draftId) {
    return NextResponse.json({ error: "ID fehlt." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const del = await ctx.service.from("lead_sequence_drafts").delete().eq("id", draftId);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}

