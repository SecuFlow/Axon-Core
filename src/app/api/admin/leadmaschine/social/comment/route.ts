import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { generateLinkedInComment } from "@/lib/leadSocialContent.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

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
 * POST /api/admin/leadmaschine/social/comment
 * Body: { prospect_id: string (UUID), post_text: string }
 *
 * Generiert einen KI-Kommentar-Entwurf zu einem vom Admin eingefuegten
 * LinkedIn-Post des Managers und speichert ihn im content_pool.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  let body: { prospect_id?: unknown; post_text?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Ungültiger Body." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const prospect_id = typeof body.prospect_id === "string" ? body.prospect_id.trim() : "";
  const post_text = typeof body.post_text === "string" ? body.post_text.trim() : "";

  if (!prospect_id || !/^[0-9a-f-]{36}$/i.test(prospect_id)) {
    return NextResponse.json(
      { error: "Prospect-ID erforderlich." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!post_text || post_text.length < 40) {
    return NextResponse.json(
      { error: "Post-Text zu kurz (mindestens 40 Zeichen)." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const prospectRes = await ctx.service
    .from("linkedin_prospects")
    .select(
      "id, manager_name, corporate_group_name, location_name, department, industry, status",
    )
    .eq("id", prospect_id)
    .maybeSingle();

  if (prospectRes.error) {
    if (isTableMissingError(prospectRes.error.message)) return tableMissingResponse();
    return NextResponse.json(
      { error: prospectRes.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
  const prospect = prospectRes.data as
    | {
        id: string;
        manager_name: string;
        corporate_group_name: string | null;
        location_name: string | null;
        department: string | null;
        industry: string | null;
        status: string;
      }
    | null;
  if (!prospect) {
    return NextResponse.json(
      { error: "Prospect nicht gefunden." },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  const generated = await generateLinkedInComment({
    postText: post_text,
    prospect: {
      manager_name: prospect.manager_name,
      corporate_group_name: prospect.corporate_group_name,
      location_name: prospect.location_name,
      department: prospect.department,
      industry: prospect.industry,
    },
  });

  if (!generated.text) {
    return NextResponse.json(
      { error: "KI konnte keinen Kommentar generieren." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  const ins = await ctx.service
    .from("content_pool")
    .insert({
      type: "comment",
      target_prospect_id: prospect_id,
      source_post_text: post_text.slice(0, 8000),
      text_draft: generated.text,
      model: generated.model,
      is_posted: false,
    })
    .select("id, created_at, text_draft, model")
    .single();

  if (ins.error) {
    if (isTableMissingError(ins.error.message)) return tableMissingResponse();
    return NextResponse.json(
      { error: ins.error.message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: ins.data?.id,
      text_draft: generated.text,
      model: generated.model,
    },
    { headers: NO_STORE_HEADERS },
  );
}
