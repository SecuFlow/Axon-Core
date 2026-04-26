import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogContext = {
  service: SupabaseClient;
  /** Ausführende Person (Auth-UUID), optional bei rein technischen Jobs */
  userId?: string | null;
  /** public.companies.id */
  companyId?: string | null;
  /** Mandanten-UUID (companies.tenant_id / profiles.tenant_id) */
  tenantId?: string | null;
  aiCaseId?: string | null;
};

/**
 * Schreibt einen Eintrag in `audit_logs` (nur serverseitig mit Service Role).
 * Signatur: Aktion, Beschreibung, optionale Metadaten — plus Kontext für Mandant und Fall.
 */
export async function logEvent(
  action: string,
  description: string,
  metadata: Record<string, unknown> | undefined,
  ctx: AuditLogContext,
): Promise<void> {
  const { service, userId, companyId, tenantId, aiCaseId } = ctx;
  const { error } = await service.from("audit_logs").insert({
    action,
    description,
    metadata: metadata ?? {},
    user_id: userId ?? null,
    company_id: companyId ?? null,
    tenant_id: tenantId ?? null,
    ai_case_id: aiCaseId ?? null,
  });
  if (error) {
    console.error("[audit_logs]", error.message);
  }
}
