import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/auditLog";

const ENTERPRISE_MIGRATION_ACTION = "system.enterprise_migration_complete";

/**
 * Einmal pro Nutzer nach der Enterprise-Migration: Audit-Eintrag beim ersten Login.
 */
export async function ensureEnterpriseMigrationAuditOnLogin(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: existing } = await service
    .from("audit_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("action", ENTERPRISE_MIGRATION_ACTION)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  const { data: prof } = await service
    .from("profiles")
    .select("company_id, tenant_id")
    .eq("id", userId)
    .maybeSingle();

  const p = prof as { company_id?: string | null; tenant_id?: string | null } | null;
  const tenantRef =
    typeof p?.tenant_id === "string" && p.tenant_id.trim()
      ? p.tenant_id.trim()
      : null;

  let companyPk: string | null =
    typeof p?.company_id === "string" && p.company_id.trim()
      ? p.company_id.trim()
      : null;

  if (tenantRef && !companyPk) {
    const { data: co } = await service
      .from("companies")
      .select("id")
      .eq("tenant_id", tenantRef)
      .maybeSingle();
    companyPk = (co as { id?: string } | null)?.id ?? companyPk;
  }

  await logEvent(
    ENTERPRISE_MIGRATION_ACTION,
    "System-Migration auf Enterprise-Version erfolgreich",
    { source: "login", kind: "enterprise_migration_ack" },
    {
      service,
      userId,
      companyId: companyPk,
      tenantId: tenantRef,
      aiCaseId: null,
    },
  );
}
