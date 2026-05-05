import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadCompanyBranding } from "@/lib/companyBranding.server";
import { PRIVATE_SWR_HEADERS } from "@/lib/httpCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY fehlt." },
      { status: 503 },
    );
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Profil-Join und Branding-Resolution parallel: spart 1× Round-Trip-Latenz
  // (vorher sequenziell: getUser → profiles+companies → branding-Pfad).
  const [profileRes, branding] = await Promise.all([
    service
      .from("profiles")
      .select("*, companies(*)")
      .eq("id", user.id)
      .maybeSingle(),
    loadCompanyBranding(service, user.id),
  ]);

  return NextResponse.json(
    { profile: profileRes.data ?? null, branding },
    { headers: PRIVATE_SWR_HEADERS },
  );
}

