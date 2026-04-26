import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Eigener Storage-Key, damit GoTrue nicht mit anderen Supabase-Clients im Tab kollidiert. */
const DASHBOARD_AUTH_STORAGE_KEY = "sb-axon-dashboard-bearer-client";

let dashboardClient: SupabaseClient | null = null;
let dashboardClientToken: string | null = null;

/**
 * Supabase-Client mit dem JWT aus dem Dashboard-Login (httpOnly Cookie wird
 * serverseitig gelesen und für Client-Flows via `/api/dashboard/branding/context` bereitgestellt).
 *
 * Singleton pro Access-Token — vermeidet „Multiple GoTrueClient instances“ im Browser.
 */
export function createDashboardSupabaseClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.replace(/\s/g, "");
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen.");
  }
  if (
    dashboardClient &&
    dashboardClientToken === accessToken
  ) {
    return dashboardClient;
  }
  dashboardClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: DASHBOARD_AUTH_STORAGE_KEY,
    },
  });
  dashboardClientToken = accessToken;
  return dashboardClient;
}
