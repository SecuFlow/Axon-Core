import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { generateLinkedInPost } from "@/lib/leadSocialContent.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

const SELECT_COLUMNS =
  "id, created_at, updated_at, type, text_draft, model, is_posted, scheduled_for, posted_at, metadata";

function isTableMissingError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("does not exist") || m.includes("42p01");
}

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        "content_pool-Tabelle fehlt. Bitte Migration 20260424000000_leadmaschine_linkedin_ecosystem.sql ausführen.",
    },
    { status: 503, headers: NO_STORE_HEADERS },
  );
}

/**
 * GET /api/admin/leadmaschine/social/post
 * Liefert Post-Entwuerfe (LinkedIn).
 *
 * Comment-Drafts wurden mit dem Apollo-Pivot eingestellt (frueher an
 * linkedin_prospects gekoppelt). Diese Route filtert ausschliesslich
 * type=post.
 */
export async function GET(_request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const res = await ctx.service
    .from("content_pool")
    .select(SELECT_COLUMNS)
    .eq("type", "post")
    .order("created_at", { ascending: false })
    .limit(200);

  if (res.error) {
    if (isTableMissingError(res.error.message)) return tableMissingResponse();
    return NextResponse.json(
      { error: res.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ items: res.data ?? [] }, { headers: NO_STORE_HEADERS });
}

/**
 * POST /api/admin/leadmaschine/social/post
 * Body (optional): { topic_hint?: string }
 * Generiert einen neuen Post-Entwurf und speichert ihn in content_pool.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: { topic_hint?: unknown } = {};
  try {
    if (request.headers.get("content-length") !== "0") {
      body = (await request.json()) as typeof body;
    }
  } catch {
    // Leerer Body ok.
  }
  const topicHint =
    typeof body.topic_hint === "string" ? body.topic_hint.trim() || null : null;

  const generated = await generateLinkedInPost({ topicHint });
  if (!generated.text) {
    return NextResponse.json(
      { error: "KI konnte keinen Post generieren." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  const ins = await ctx.service
    .from("content_pool")
    .insert({
      type: "post",
      text_draft: generated.text,
      model: generated.model,
      is_posted: false,
      metadata: { topic: generated.topic, trigger: "manual" },
    })
    .select(SELECT_COLUMNS)
    .single();

  if (ins.error) {
    if (isTableMissingError(ins.error.message)) return tableMissingResponse();
    return NextResponse.json(
      { error: ins.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { ok: true, item: ins.data },
    { headers: NO_STORE_HEADERS },
  );
}
