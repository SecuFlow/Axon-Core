import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canManageCompanyBranding,
  getBrandingScopeForUser,
  loadCompanyBranding,
} from "@/lib/companyBranding.server";

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
      { error: "Server-Konfiguration unvollständig (Service Role)." },
      { status: 503 },
    );
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const canManage = await canManageCompanyBranding(service, user);
  if (!canManage) {
    return NextResponse.json({ error: "Kein Zugriff auf Branding." }, { status: 403 });
  }

  const scope = await getBrandingScopeForUser(service, user.id);
  if (!scope) {
    return NextResponse.json(
      { error: "Kein Mandanten-Scope für Branding gefunden." },
      { status: 400 },
    );
  }
  const branding = await loadCompanyBranding(service, user.id);

  return NextResponse.json({
    accessToken,
    companyId: scope.companyId,
    tenantId: scope.tenantId,
    companyDisplayName: scope.companyDisplayName,
    primaryColor: branding.primary_color ?? null,
    logoUrl: branding.logo_url ?? null,
  });
}
