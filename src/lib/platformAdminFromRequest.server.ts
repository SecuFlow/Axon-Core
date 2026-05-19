import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { isJwtOrMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";
import { fetchProfileIsPlatformAdmin } from "@/lib/profilePlatformAdmin";

function sanitizeEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

/**
 * Best-Effort-Check: Ist der aktuelle Request von einem eingeloggten
 * Plattform-Admin? Verwendet exakt dieselben Regeln wie
 * `requireAdminMutationContext`, gibt aber NIE einen Fehler zurück — bei
 * fehlendem Cookie oder unkonfigurierter Supabase-Anbindung kommt einfach
 * `false` heraus. Geeignet für öffentliche Endpoints, die Admin-Klicks
 * ausblenden möchten (z. B. Demo-Link-Resolver).
 *
 * Liefert zusätzlich die Admin-User-ID, falls verfügbar — nützlich für
 * Audit-Logs ("Admin-Preview von <userId>").
 */
export async function detectPlatformAdminFromCookies(): Promise<{
  isAdmin: boolean;
  userId: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;
    if (!accessToken) return { isAdmin: false, userId: null };

    const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseUrl || !supabaseAnonKey) return { isAdmin: false, userId: null };

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error,
    } = await supabaseUser.auth.getUser();
    if (error || !user) return { isAdmin: false, userId: null };

    if (isJwtOrMetadataAdmin(user)) {
      return { isAdmin: true, userId: user.id };
    }
    if (!serviceRoleKey) return { isAdmin: false, userId: user.id };
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (await fetchProfileIsPlatformAdmin(service, user.id)) {
      return { isAdmin: true, userId: user.id };
    }
    const { data: rows } = await service
      .from("companies")
      .select("role")
      .eq("user_id", user.id)
      .limit(1);
    const row = rows?.[0];
    if (row != null && normalizeDbRole(row.role) === "admin") {
      return { isAdmin: true, userId: user.id };
    }
    return { isAdmin: false, userId: user.id };
  } catch {
    return { isAdmin: false, userId: null };
  }
}
