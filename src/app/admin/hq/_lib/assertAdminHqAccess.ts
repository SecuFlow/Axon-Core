import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isJwtOrMetadataAdmin, normalizeDbRole } from "@/lib/adminAccess";
import { fetchProfileIsPlatformAdmin } from "@/lib/profilePlatformAdmin";

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

/**
 * Server-only: JWT-Admin, profiles.role admin oder companies.role admin (Service Role).
 * SUPABASE_SERVICE_ROLE_KEY bleibt nur auf dem Server.
 */
export async function assertAdminHqAccess(): Promise<void> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;

  if (!accessToken) {
    redirect("/admin/hq/login");
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !supabaseAnonKey) {
    redirect("/admin/hq/login");
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    redirect("/admin/hq/login");
  }

  if (isJwtOrMetadataAdmin(user)) {
    return;
  }

  if (!serviceRoleKey) {
    redirect("/admin/hq/login");
  }

  const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (await fetchProfileIsPlatformAdmin(supabaseService, user.id)) {
    return;
  }

  const { data: rows } = await supabaseService
    .from("companies")
    .select("role")
    .eq("user_id", user.id)
    .limit(1);

  const row = rows?.[0];
  if (row != null && normalizeDbRole(row.role) === "admin") {
    return;
  }

  redirect("/admin/hq/login");
}
