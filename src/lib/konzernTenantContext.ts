import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isJwtOrMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";
import { fetchProfileIsPlatformAdmin } from "@/lib/profilePlatformAdmin";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

export type KonzernTenantContext =
  | {
      ok: true;
      service: SupabaseClient;
      userId: string;
      /** Nur fuer Plattform-Admins null: alle Mandanten sichtbar. */
      tenantId: string | null;
      isAdmin: boolean;
      /** companies.role normalisiert (admin, manager, user, ...). */
      companyRole: string;
    }
  | { ok: false; error: string; status: number };

/**
 * Konzern-APIs: eingeloggter Nutzer mit Service Role.
 * Admins (JWT, profiles.role admin oder companies.role admin): tenantId = null.
 * Sonst: Filter ueber companies.tenant_id (Manager/Nutzer).
 */
export async function requireKonzernTenantContext(): Promise<KonzernTenantContext> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    return { ok: false, error: "Nicht angemeldet.", status: 401 };
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, error: "Supabase ist nicht konfiguriert.", status: 500 };
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
    return { ok: false, error: "Session ungültig.", status: 401 };
  }

  if (!serviceRoleKey) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY fehlt.",
      status: 503,
    };
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (isJwtOrMetadataAdmin(user)) {
    return {
      ok: true,
      service,
      userId: user.id,
      tenantId: null,
      isAdmin: true,
      companyRole: "admin",
    };
  }

  if (await fetchProfileIsPlatformAdmin(service, user.id)) {
    return {
      ok: true,
      service,
      userId: user.id,
      tenantId: null,
      isAdmin: true,
      companyRole: "admin",
    };
  }

  // Wichtig: Ein User kann mehrere `companies`-Zeilen haben (z. B. Workforce + Konzern).
  // `limit(1)` ist nicht deterministisch und kann zu "flapping" führen (sporadisch Admin/anderer Tenant).
  // Daher: alle Zeilen laden und anhand von profiles.tenant_id die passende auswählen.
  const { data: rows } = await service
    .from("companies")
    .select("role,tenant_id,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const companyRows = (rows ?? []) as Array<{
    role?: unknown;
    tenant_id?: string | null;
    created_at?: string | null;
  }>;

  const { data: profRow } = await service
    .from("profiles")
    .select("company_id, tenant_id, role")
    .eq("id", user.id)
    .maybeSingle();

  const prof = profRow as
    | {
        company_id?: string | null;
        tenant_id?: string | null;
        role?: unknown;
      }
    | null;

  const profTenantId =
    typeof prof?.tenant_id === "string" && prof.tenant_id.trim().length > 0
      ? prof.tenant_id.trim()
      : null;
  const profCompanyPk =
    typeof prof?.company_id === "string" && prof.company_id.trim().length > 0
      ? prof.company_id.trim()
      : null;
  const profRoleNorm = normalizeDbRole(prof?.role);

  let tenantFromCompanyPk: string | null = null;
  if (profCompanyPk) {
    const { data: coByPk } = await service
      .from("companies")
      .select("tenant_id")
      .eq("id", profCompanyPk)
      .maybeSingle();
    const tid = (coByPk as { tenant_id?: string | null } | null)?.tenant_id;
    if (typeof tid === "string" && tid.trim().length > 0) {
      tenantFromCompanyPk = tid.trim();
    }
  }

  const companyRowForTenant =
    profTenantId != null
      ? companyRows.find(
          (r) =>
            typeof r.tenant_id === "string" &&
            r.tenant_id.trim().length > 0 &&
            r.tenant_id.trim() === profTenantId,
        ) ?? null
      : companyRows.find(
          (r) => typeof r.tenant_id === "string" && r.tenant_id.trim().length > 0,
        ) ?? null;

  const companyTenantId =
    typeof companyRowForTenant?.tenant_id === "string" &&
    companyRowForTenant.tenant_id.trim().length > 0
      ? companyRowForTenant.tenant_id.trim()
      : null;

  /** Mandant: Zuweisung über profiles.company_id schlägt veraltete tenant_id. */
  const tenantId = tenantFromCompanyPk ?? profTenantId ?? companyTenantId ?? null;

  // `companies.role=admin` bedeutet hier Konzern-Admin im Tenant, NICHT Plattform-Admin.
  // Plattform-Admin ist ausschließlich über JWT/Metadata oder `profilePlatformAdmin`.
  let companyRole = normalizeDbRole(companyRowForTenant?.role);
  if (profRoleNorm === "manager") {
    companyRole = "manager";
  }
  if (profRoleNorm === "admin") {
    companyRole = "admin";
  }

  if (!tenantId) {
    return {
      ok: false,
      error: "Keine Mandanten-Zuordnung (tenant_id).",
      status: 403,
    };
  }

  return {
    ok: true,
    service,
    userId: user.id,
    tenantId,
    isAdmin: false,
    companyRole,
  };
}
