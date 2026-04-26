import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getDefaultDemoSlug } from "@/lib/defaultDemoSlug.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

/**
 * Liefert einen Demo-Slug für `?demo=true` (erste aktive Demo-Firma mit gesetztem Slug).
 * Optional: `AXON_DEMO_DEFAULT_SLUG` in .env als Fallback.
 */
export async function GET() {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { slug: null, error: "Server nicht konfiguriert." },
      { status: 503 },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const slug = await getDefaultDemoSlug(service);
  if (!slug) {
    return NextResponse.json({
      slug: null,
      error:
        "Kein Demo-Slug. Setze AXON_DEMO_DEFAULT_SLUG oder eine aktive Demo-Firma mit demo_slug.",
    });
  }

  return NextResponse.json({ slug });
}
