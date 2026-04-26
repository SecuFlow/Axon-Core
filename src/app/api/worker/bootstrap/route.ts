import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadCompanyBranding } from "@/lib/companyBranding.server";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!accessToken || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await userScoped.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profileRes = await service
    .from("profiles")
    .select("mandant_id,tenant_id,company_id,must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  const p = profileRes.data as
    | {
        mandant_id?: string | null;
        tenant_id?: string | null;
        company_id?: string | null;
        must_change_password?: boolean | null;
      }
    | null;
  const mandantId =
    p?.mandant_id?.trim() || p?.tenant_id?.trim() || p?.company_id?.trim() || null;

  if (!mandantId) {
    return NextResponse.json(
      { error: "Keine Mandanten-Zuordnung für Mitarbeiter." },
      { status: 403 },
    );
  }

  const branding = await loadCompanyBranding(service, user.id);
  return NextResponse.json({
    ok: true,
    mandant_id: mandantId,
    must_change_password: p?.must_change_password === true,
    accessToken,
    branding,
  });
}
