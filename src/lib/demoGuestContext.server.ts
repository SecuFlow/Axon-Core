import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDefaultDemoSlug } from "@/lib/defaultDemoSlug.server";
import { resolveDemoCompanyByParam } from "@/lib/resolveDemoCompanyByParam.server";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export type DemoGuestContext =
  | { ok: true; service: SupabaseClient; companyId: string; tenantId: string }
  | { ok: false; status: number; error: string };

/**
 * Einheitliche Auflösung inkl. Auto-Create für neue `demo_slug`-Werte
 * (siehe `resolveDemoCompanyByParam`).
 */
export async function resolveDemoGuestContextFromRequest(
  request: Request,
): Promise<DemoGuestContext> {
  const url = new URL(request.url);
  const demoRaw = (url.searchParams.get("demo") ?? "").trim();
  if (!demoRaw) {
    return { ok: false, status: 400, error: "Ungültiger demo-Parameter." };
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, status: 503, error: "Server nicht konfiguriert." };
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let demoKey = demoRaw;
  if (demoKey.toLowerCase() === "true") {
    const s = await getDefaultDemoSlug(service);
    if (!s) {
      return {
        ok: false,
        status: 400,
        error:
          "Kein Demo-Slug für ?demo=true. Setze AXON_DEMO_DEFAULT_SLUG oder eine aktive Demo-Firma mit demo_slug.",
      };
    }
    demoKey = s;
  }

  const resolved = await resolveDemoCompanyByParam(service, demoKey, {
    allowInactiveDemo: true,
  });
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      error: resolved.message,
    };
  }

  const tenantId =
    resolved.row.tenant_id?.trim?.() || resolved.companyId;
  return {
    ok: true,
    service,
    companyId: resolved.companyId,
    tenantId,
  };
}
