import type { SupabaseClient } from "@supabase/supabase-js";
import type { KonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveMandantTenantId } from "@/lib/resolveMandantTenantId";

export type KonzernDataScope =
  | { kind: "global_admin" }
  | { kind: "tenant"; tenantId: string }
  | { kind: "invalid"; error: string };

/**
 * Admin ohne Query-Parameter: globaler Zugriff.
 * Admin mit `company_id` / `tenantId`: auf einen Mandanten einschränken.
 * Konzern-Nutzer: immer eigener `tenantId`.
 */
export async function resolveKonzernDataScopeAsync(
  service: SupabaseClient,
  ctx: Extract<KonzernTenantContext, { ok: true }>,
  request: Request,
): Promise<KonzernDataScope> {
  const url = new URL(request.url);
  const rawParam = (
    url.searchParams.get("company_id") ??
    url.searchParams.get("tenantId") ??
    ""
  ).trim();

  if (ctx.isAdmin) {
    if (!rawParam) {
      return { kind: "global_admin" };
    }
    const tenantId = await resolveMandantTenantId(service, rawParam);
    if (!tenantId) {
      return { kind: "invalid", error: "Unbekannter Konzern." };
    }
    return { kind: "tenant", tenantId };
  }

  if (!ctx.tenantId) {
    return { kind: "invalid", error: "Kein Mandant." };
  }
  return { kind: "tenant", tenantId: ctx.tenantId };
}
