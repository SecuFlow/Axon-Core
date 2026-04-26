import type { SupabaseClient } from "@supabase/supabase-js";

const SEED_MACHINES: Array<{
  serial_number: string;
  name: string;
  status: "active" | "maintenance" | "offline";
}> = [
  { serial_number: "SEED-001", name: "Spritzguss-Anlage A1", status: "active" },
  { serial_number: "SEED-002", name: "Roboterarm Kuka KR", status: "active" },
  { serial_number: "SEED-003", name: "CNC-Bearbeitungszentrum", status: "maintenance" },
];

/**
 * Legt drei Beispiel-Maschinen an, wenn das Inventar für die Firma noch leer ist
 * (z. B. direkt nach Auto-Create über Demo-Slug).
 */
export async function ensureDemoSeedMachinesIfEmpty(
  service: SupabaseClient,
  companyId: string,
): Promise<void> {
  const { count, error: countErr } = await service
    .from("machines")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (countErr) {
    console.warn("[demoSeedMachines] count:", countErr.message);
    return;
  }
  if ((count ?? 0) > 0) return;

  const { error: insErr } = await service.from("machines").insert(
    SEED_MACHINES.map((m) => ({
      company_id: companyId,
      serial_number: m.serial_number,
      name: m.name,
      status: m.status,
    })),
  );

  if (insErr?.code === "23505") {
    // Ein anderer Request hat parallel eingefügt — ok
    return;
  }
  if (insErr) {
    console.warn("[demoSeedMachines] insert:", insErr.message);
  }
}
