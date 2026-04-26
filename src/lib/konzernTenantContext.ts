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

  const { data: rows } = await service
    .from("companies")
    .select("role,tenant_id")
    .eq("user_id", user.id)
    .limit(1);

  const row = rows?.[0] as
    | { role?: unknown; tenant_id?: string | null }
    | undefined;

  if (row != null && normalizeDbRole(row.role) === "admin") {
    return {
      ok: true,
      service,
      userId: user.id,
      tenantId: null,
      isAdmin: true,
      companyRole: "admin",
    };
  }

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
  const profRoleNorm = normalizeDbRole(prof?.role);

  const companyTenantId =
    row?.tenant_id && typeof row.tenant_id === "string"
      ? row.tenant_id
      : null;

  /** Mandant: Profil hat Vorrang (z. B. Zuordnung zu „Axon Core HQ“). */
  const tenantId = profTenantId ?? companyTenantId ?? null;

  let companyRole = normalizeDbRole(row?.role);
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
