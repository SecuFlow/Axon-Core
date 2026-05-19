import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Beim Login: profiles anlegen oder Mandant nachziehen.
 *
 * Wichtig: Existiert bereits profiles.company_id (Admin-Zuweisung im HQ),
 * wird diese NICHT durch companies.user_id (Stripe-/Manager-Billing-Zeile) überschrieben.
 * Sonst springt der Mandant bei jedem Login z. B. von Siemens zurück auf RHI.
 */
export async function ensureUserProfileOnLogin(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: prof, error: profErr } = await service
    .from("profiles")
    .select("id, location_id, company_id, tenant_id, mandant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) return;

  const now = new Date().toISOString();

  const existingCompanyPk =
    typeof (prof as { company_id?: string | null } | null)?.company_id ===
      "string" && (prof as { company_id: string }).company_id.trim().length > 0
      ? (prof as { company_id: string }).company_id.trim()
      : null;

  if (prof && existingCompanyPk) {
    const { data: coByPk } = await service
      .from("companies")
      .select("tenant_id, mandant_id")
      .eq("id", existingCompanyPk)
      .maybeSingle();

    const tenantId =
      (typeof (coByPk as { mandant_id?: string | null } | null)?.mandant_id ===
        "string" &&
        (coByPk as { mandant_id: string }).mandant_id.trim()) ||
      (typeof (coByPk as { tenant_id?: string | null } | null)?.tenant_id ===
        "string" &&
        (coByPk as { tenant_id: string }).tenant_id.trim()) ||
      "";

    if (!tenantId) return;

    const patch: Record<string, unknown> = {
      tenant_id: tenantId,
      mandant_id: tenantId,
      updated_at: now,
    };

    const locId = (prof as { location_id?: string | null }).location_id;
    if (typeof locId !== "string" || !locId.trim()) {
      const { data: firstLoc } = await service
        .from("locations")
        .select("id")
        .eq("company_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const firstLocId = (firstLoc as { id?: string } | null)?.id ?? null;
      if (firstLocId) {
        patch.location_id = firstLocId;
      }
    }

    let res = await service.from("profiles").update(patch).eq("id", userId);
    if (res.error?.message.includes("mandant_id")) {
      const fb = { ...patch };
      delete fb.mandant_id;
      res = await service.from("profiles").update(fb).eq("id", userId);
    }
    return;
  }

  const { data: co, error: cErr } = await service
    .from("companies")
    .select("id, tenant_id, mandant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (cErr || !co) return;

  const companyPk =
    typeof (co as { id?: string }).id === "string"
      ? (co as { id: string }).id
      : null;
  const tenantId =
    (typeof (co as { mandant_id?: string | null }).mandant_id === "string" &&
      (co as { mandant_id: string }).mandant_id.trim()) ||
    (typeof (co as { tenant_id?: string | null }).tenant_id === "string" &&
      (co as { tenant_id: string }).tenant_id.trim()) ||
    "";
  if (!tenantId) return;

  const { data: firstLoc } = await service
    .from("locations")
    .select("id")
    .eq("company_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstLocId = (firstLoc as { id?: string } | null)?.id ?? null;

  if (prof) {
    const u = prof as {
      location_id?: string | null;
      company_id?: string | null;
    };
    const patch: Record<string, unknown> = {
      tenant_id: tenantId,
      mandant_id: tenantId,
      updated_at: now,
    };
    if (companyPk) {
      patch.company_id = companyPk;
    }
    if (!u.location_id && firstLocId) {
      patch.location_id = firstLocId;
    }
    let res = await service.from("profiles").update(patch).eq("id", userId);
    if (res.error?.message.includes("mandant_id")) {
      const fb = { ...patch };
      delete fb.mandant_id;
      res = await service.from("profiles").update(fb).eq("id", userId);
    }
    return;
  }

  const ins = await service.from("profiles").insert({
    id: userId,
    tenant_id: tenantId,
    mandant_id: tenantId,
    company_id: companyPk,
    location_id: firstLocId,
    updated_at: now,
  });

  if (ins.error) {
    const patch: Record<string, unknown> = {
      tenant_id: tenantId,
      mandant_id: tenantId,
      updated_at: now,
    };
    if (companyPk) patch.company_id = companyPk;
    if (firstLocId) patch.location_id = firstLocId;
    let res = await service.from("profiles").update(patch).eq("id", userId);
    if (res.error?.message.includes("mandant_id")) {
      const fb = { ...patch };
      delete fb.mandant_id;
      res = await service.from("profiles").update(fb).eq("id", userId);
    }
  }
}
