import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

function isExpired(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return true;
  return ts <= Date.now();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const t = String(token ?? "").trim();
  if (!t) return NextResponse.redirect(new URL("/demo-anfordern", req.url));

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rowRes = await service
    .from("demo_access_links")
    .select("token,demo_slug,expires_at,revoked_at")
    .eq("token", t)
    .maybeSingle();
  if (rowRes.error || !rowRes.data) {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const row = rowRes.data as {
    demo_slug?: string | null;
    expires_at?: string | null;
    revoked_at?: string | null;
  };
  if (row.revoked_at || isExpired(row.expires_at)) {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const slug = (row.demo_slug ?? "").trim();
  if (!slug) {
    return NextResponse.redirect(new URL("/demo-anfordern", req.url));
  }

  const redirectUrl = new URL("/dashboard/konzern", req.url);
  redirectUrl.searchParams.set("demo", slug);
  return NextResponse.redirect(redirectUrl);
}
