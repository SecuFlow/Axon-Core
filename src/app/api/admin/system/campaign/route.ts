import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const res = await ctx.service
    .from("marketing_campaign_settings")
    .select("enabled, title, subtitle, cta_label, cta_href, banner_image_url, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) {
    return NextResponse.json({
      enabled: false,
      title: null,
      subtitle: null,
      cta_label: null,
      cta_href: null,
      banner_image_url: null,
    });
  }

  const row = res.data as {
    enabled?: unknown;
    title?: unknown;
    subtitle?: unknown;
    cta_label?: unknown;
    cta_href?: unknown;
    banner_image_url?: unknown;
  } | null;
  return NextResponse.json({
    enabled: row?.enabled === true,
    title: typeof row?.title === "string" ? row.title : null,
    subtitle: typeof row?.subtitle === "string" ? row.subtitle : null,
    cta_label: typeof row?.cta_label === "string" ? row.cta_label : null,
    cta_href: typeof row?.cta_href === "string" ? row.cta_href : null,
    banner_image_url:
      typeof row?.banner_image_url === "string" ? row.banner_image_url : null,
  });
}

export async function PATCH(request: NextRequest) {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: {
    enabled?: unknown;
    title?: unknown;
    subtitle?: unknown;
    cta_label?: unknown;
    cta_href?: unknown;
    banner_image_url?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.title === null || typeof body.title === "string")
    update.title = body.title;
  if (body.subtitle === null || typeof body.subtitle === "string")
    update.subtitle = body.subtitle;
  if (body.cta_label === null || typeof body.cta_label === "string")
    update.cta_label = body.cta_label;
  if (body.cta_href === null || typeof body.cta_href === "string")
    update.cta_href = body.cta_href;
  if (body.banner_image_url === null || typeof body.banner_image_url === "string")
    update.banner_image_url = body.banner_image_url;

  const existing = await ctx.service
    .from("marketing_campaign_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    const upd = await ctx.service
      .from("marketing_campaign_settings")
      .update(update)
      .eq("id", existing.data.id);
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 500 });
  } else {
    const ins = await ctx.service.from("marketing_campaign_settings").insert(update);
    if (ins.error) {
      if (ins.error.message.includes("marketing_campaign_settings")) {
        return NextResponse.json(
          { error: "Kampagnen-Tabelle ist noch nicht migriert." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: ins.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

