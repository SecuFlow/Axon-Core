import { NextResponse } from "next/server";
import { createServiceClientFromEnv } from "@/lib/leadmaschineRunner.server";
import { generateLinkedInPost } from "@/lib/leadSocialContent.server";
import { verifyCronAuth } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Social-Cron: generiert 1x pro Lauf einen neuen LinkedIn-Post-Entwurf
 * und speichert ihn in content_pool. Wird in vercel.json 2x pro Woche
 * ausgefuehrt (Mo + Do).
 *
 * Idempotenz: Pro Kalendertag max. 1 neuer Post-Entwurf ueber Cron.
 * Falls heute schon einer angelegt wurde, wird der Lauf uebersprungen.
 */
async function handle(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const service = await createServiceClientFromEnv();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Pro-Tag-Idempotenz: nur einen Post-Entwurf pro Tag via Cron anlegen.
  const existing = await service
    .from("content_pool")
    .select("id", { count: "exact", head: true })
    .eq("type", "post")
    .gte("created_at", startOfDay.toISOString());

  if (!existing.error && (existing.count ?? 0) > 0) {
    return NextResponse.json({
      ok: true,
      skipped: "post_already_generated_today",
      count_today: existing.count ?? 0,
    });
  }

  const generated = await generateLinkedInPost({ topicHint: null });
  if (!generated.text) {
    return NextResponse.json(
      { ok: false, error: "KI lieferte keinen Inhalt." },
      { status: 502 },
    );
  }

  const ins = await service
    .from("content_pool")
    .insert({
      type: "post",
      text_draft: generated.text,
      model: generated.model,
      is_posted: false,
      metadata: { topic: generated.topic, trigger: "cron" },
    })
    .select("id, created_at")
    .single();

  if (ins.error) {
    return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: ins.data?.id });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
