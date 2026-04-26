import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export async function GET() {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ enabled: false });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const res = await service
    .from("marketing_campaign_settings")
    .select("enabled, title, subtitle, cta_label, cta_href, banner_image_url, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) {
    return NextResponse.json({ enabled: false });
  }

  const row = res.data as
    | {
        enabled?: unknown;
        title?: unknown;
        subtitle?: unknown;
        cta_label?: unknown;
        cta_href?: unknown;
        banner_image_url?: unknown;
      }
    | null;

  const enabled = row?.enabled === true;
  if (!enabled) return NextResponse.json({ enabled: false });

  const title = typeof row?.title === "string" ? row.title.trim() : "";
  const subtitle = typeof row?.subtitle === "string" ? row.subtitle.trim() : "";
  const cta_label = typeof row?.cta_label === "string" ? row.cta_label.trim() : "";
  const cta_href = typeof row?.cta_href === "string" ? row.cta_href.trim() : "";
  const banner_image_url =
    typeof row?.banner_image_url === "string" ? row.banner_image_url.trim() : "";

  return NextResponse.json({
    enabled: true,
    title: title || null,
    subtitle: subtitle || null,
    cta_label: cta_label || null,
    cta_href: cta_href || null,
    banner_image_url: banner_image_url || null,
  });
}

