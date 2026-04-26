import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/app/admin/hq/_lib/requireAdminApiSession";
import { buildDailyBriefing } from "@/lib/axonSekretaer.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function GET() {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const r = await ctx.service
    .from("admin_briefings")
    .select("id,created_at,title,content,metadata")
    .order("created_at", { ascending: false })
    .limit(20);

  if (r.error) {
    return NextResponse.json({ error: r.error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ items: r.data ?? [] }, { headers: NO_STORE_HEADERS });
}

export async function POST() {
  const ctx = await requireAdminApiSession();
  if (ctx instanceof NextResponse) return ctx;

  const brief = await buildDailyBriefing({ service: ctx.service });
  const ins = await ctx.service
    .from("admin_briefings")
    .insert({
      title: brief.title,
      content: brief.content,
      metadata: { ...brief.metadata, actor: ctx.actorId },
    })
    .select("id,created_at,title,content,metadata")
    .single();

  if (ins.error || !ins.data) {
    return NextResponse.json(
      { error: ins.error?.message ?? "Briefing konnte nicht erstellt werden." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ item: ins.data }, { headers: NO_STORE_HEADERS });
}

