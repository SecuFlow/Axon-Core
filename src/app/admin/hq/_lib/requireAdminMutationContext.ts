import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isJwtOrMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";
import { fetchProfileIsPlatformAdmin } from "@/lib/profilePlatformAdmin";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

export type AdminMutationContext =
  | { ok: true; service: SupabaseClient; actorId: string }
  | { ok: false; error: string; status: number };

/**
 * Server Actions & API: gleiche Admin-Regeln wie assertAdminHqAccess.
 */
export async function requireAdminMutationContext(): Promise<AdminMutationContext> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    return { ok: false, error: "Nicht angemeldet.", status: 401 };
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      error: "Supabase ist nicht konfiguriert.",
      status: 500,
    };
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
      error: "User-Verwaltung benötigt SUPABASE_SERVICE_ROLE_KEY.",
      status: 503,
    };
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (isJwtOrMetadataAdmin(user)) {
    return { ok: true, service, actorId: user.id };
  }

  if (await fetchProfileIsPlatformAdmin(service, user.id)) {
    return { ok: true, service, actorId: user.id };
  }

  const { data: rows } = await service
    .from("companies")
    .select("role")
    .eq("user_id", user.id)
    .limit(1);

  const row = rows?.[0];
  if (row != null && normalizeDbRole(row.role) === "admin") {
    return { ok: true, service, actorId: user.id };
  }

  return { ok: false, error: "Kein Admin-Zugriff.", status: 403 };
}
