import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { resolveDemoCompanyByParam } from "@/lib/resolveDemoCompanyByParam.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyParam = url.searchParams.get("company") ?? "";

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { logo_url: null, primary_color: null },
      { status: 200 },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resolved = await resolveDemoCompanyByParam(service, companyParam, {
    allowInactiveDemo: true,
  });
  if (!resolved.ok) {
    return NextResponse.json({ logo_url: null, primary_color: null }, { status: 200 });
  }
  const r = resolved.row;
  const logo_url = typeof r.logo_url === "string" ? r.logo_url : null;
  const primary_color = typeof r.primary_color === "string" ? r.primary_color : null;
  return NextResponse.json(
    { logo_url, primary_color },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}

