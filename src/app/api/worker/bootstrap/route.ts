import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadCompanyBranding } from "@/lib/companyBranding.server";
import {
  loadTenantByCompanyPkMap,
  resolveProfileMandantTenantId,
} from "@/lib/profileMandateResolve.server";
import { NO_STORE_HEADERS, PRIVATE_SWR_HEADERS } from "@/lib/httpCache";

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
    return NextResponse.json(
      { error: "Nicht angemeldet." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const userScoped = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await userScoped.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sitzung ungültig." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Profil-Lookup und Branding-Resolution parallel — beide brauchen denselben
  // Service-Client und teilen keine Daten, daher konfliktfrei in Promise.all.
  const [profileRes, branding] = await Promise.all([
    service
      .from("profiles")
      .select("mandant_id,tenant_id,company_id,must_change_password")
      .eq("id", user.id)
      .maybeSingle(),
    loadCompanyBranding(service, user.id),
  ]);

  const p = profileRes.data as
    | {
        mandant_id?: string | null;
        tenant_id?: string | null;
        company_id?: string | null;
        must_change_password?: boolean | null;
      }
    | null;
  const tenantByCompanyPk = await loadTenantByCompanyPkMap(service);
  const mandantId = await resolveProfileMandantTenantId(
    service,
    {
      company_id:
        typeof p?.company_id === "string" && p.company_id.trim()
          ? p.company_id.trim()
          : null,
      tenant_id:
        typeof p?.tenant_id === "string" && p.tenant_id.trim()
          ? p.tenant_id.trim()
          : null,
      mandant_id:
        typeof p?.mandant_id === "string" && p.mandant_id.trim()
          ? p.mandant_id.trim()
          : null,
    },
    tenantByCompanyPk,
  );

  if (!mandantId) {
    return NextResponse.json(
      { error: "Keine Mandanten-Zuordnung für Mitarbeiter." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      mandant_id: mandantId,
      must_change_password: p?.must_change_password === true,
      accessToken,
      branding,
    },
    { headers: PRIVATE_SWR_HEADERS },
  );
}
