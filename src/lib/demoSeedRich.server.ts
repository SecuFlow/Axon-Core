import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/auditLog";

const SEED_MACHINES: Array<{
  serial_suffix: string;
  name: string;
  status: "active" | "maintenance" | "offline";
}> = [
  { serial_suffix: "S7", name: "Spritzgussmaschine S7", status: "active" },
  { serial_suffix: "FB", name: "Förderband Alpha", status: "maintenance" },
  { serial_suffix: "R1", name: "Industrieroboter R1", status: "active" },
];

const CASE_TEMPLATES: ReadonlyArray<{
  action: string;
  detail: string;
  analysis: string;
  steps: string[];
  priority: "Niedrig" | "Mittel" | "Hoch";
}> = [
  {
    action: "maintenance",
    detail: "Regelmäßige Wartung durchgeführt (Ölstand geprüft, Filter gereinigt).",
    analysis: "Wartung abgeschlossen. Keine kritischen Abweichungen festgestellt.",
    steps: ["Filter reinigen", "Schmierung prüfen", "Testlauf durchführen"],
    priority: "Niedrig",
  },
  {
    action: "inspection",
    detail: "Sicherheitscheck abgeschlossen. Keine Auffälligkeiten.",
    analysis: "Sicherheitsprüfung erfolgreich. Alle Sensoren im Normalbereich.",
    steps: ["Schutzeinrichtungen prüfen", "Not-Aus testen", "Sensorstatus dokumentieren"],
    priority: "Niedrig",
  },
  {
    action: "repair",
    detail: "Sensor neu kalibriert und Testlauf erfolgreich.",
    analysis: "Ursache war eine Drift in der Sensorkalibrierung. Nachjustierung stabil.",
    steps: ["Sensor kalibrieren", "Parameter speichern", "Testlauf validieren"],
    priority: "Mittel",
  },
];

function safeSerialToken(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 18);
}

/**
 * Idempotenter, additiver Demo-Seed.
 *
 * - Legt 3 Maschinen an, falls keine existieren (Standard-Set, ohne `location_id`).
 * - Legt eine Hauptwerk-Location an, falls keine existiert; weist alle Maschinen zu, die noch keine haben.
 * - Erzeugt 2–3 AI-Cases + Machine-Logs pro Maschine, falls bisher 0 AI-Cases für die Firma existieren.
 *
 * Keine bestehenden Daten werden gelöscht oder überschrieben — nur Lücken werden gefüllt.
 */
export async function ensureDemoSeedRich(
  service: SupabaseClient,
  companyId: string,
  seedLabel: string,
): Promise<{
  created: { machines: number; locations: number; ai_cases: number; machine_logs: number };
}> {
  const created = { machines: 0, locations: 0, ai_cases: 0, machine_logs: 0 };
  const serialBase = safeSerialToken(seedLabel || companyId);

  // 1) Maschinen-Inventar prüfen / auffüllen.
  const machinesRes = await service
    .from("machines")
    .select("id, serial_number, location_id")
    .eq("company_id", companyId);

  if (machinesRes.error) {
    throw new Error(`machines select: ${machinesRes.error.message}`);
  }
  let machines = (machinesRes.data ?? []) as Array<{
    id: string;
    serial_number: string;
    location_id: string | null;
  }>;

  if (machines.length === 0) {
    const ins = await service
      .from("machines")
      .insert(
        SEED_MACHINES.map((m) => ({
          company_id: companyId,
          serial_number: `DEMO-${serialBase}-${m.serial_suffix}`,
          name: m.name,
          status: m.status,
        })),
      )
      .select("id, serial_number, location_id");
    if (ins.error) throw new Error(`machines insert: ${ins.error.message}`);
    machines = (ins.data ?? []) as typeof machines;
    created.machines = machines.length;
  }

  // 2) Location prüfen / anlegen + leeren Maschinen zuweisen.
  const locsRes = await service
    .from("locations")
    .select("id, name")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (locsRes.error) {
    throw new Error(`locations select: ${locsRes.error.message}`);
  }
  let primaryLocationId =
    Array.isArray(locsRes.data) && locsRes.data.length > 0
      ? ((locsRes.data[0] as { id?: string }).id ?? null)
      : null;

  if (!primaryLocationId) {
    const insLoc = await service
      .from("locations")
      .insert({
        company_id: companyId,
        name: "Hauptwerk",
        address: `Demo-Standort für ${seedLabel}`,
      })
      .select("id")
      .maybeSingle();
    if (insLoc.error) throw new Error(`locations insert: ${insLoc.error.message}`);
    const insRow = insLoc.data as { id?: string } | null;
    if (insRow?.id) {
      primaryLocationId = insRow.id;
      created.locations = 1;
    }
  }

  if (primaryLocationId) {
    const machinesWithoutLoc = machines.filter((m) => !m.location_id);
    if (machinesWithoutLoc.length > 0) {
      const upd = await service
        .from("machines")
        .update({ location_id: primaryLocationId })
        .in(
          "id",
          machinesWithoutLoc.map((m) => m.id),
        );
      if (upd.error) {
        throw new Error(`machines location update: ${upd.error.message}`);
      }
      // Lokal nachziehen, damit nachfolgende Konsumenten es konsistent sehen.
      machines = machines.map((m) =>
        m.location_id ? m : { ...m, location_id: primaryLocationId },
      );
    }
  }

  // 3) AI-Cases & Machine-Logs prüfen / auffüllen.
  if (machines.length > 0) {
    const machineIds = machines.map((m) => m.id);
    const aiRes = await service
      .from("ai_cases")
      .select("id, machine_id", { count: "exact", head: false })
      .in("machine_id", machineIds)
      .limit(1);
    if (aiRes.error && !aiRes.error.message.includes("does not exist")) {
      throw new Error(`ai_cases select: ${aiRes.error.message}`);
    }
    const hasAiCases =
      (aiRes.data ?? []).length > 0 || (aiRes.count !== null && (aiRes.count ?? 0) > 0);

    if (!hasAiCases) {
      const now = Date.now();
      for (const [idx, m] of machines.entries()) {
        const count = 2 + (idx % 2); // 2–3 Einträge
        for (let i = 0; i < count; i++) {
          const t = CASE_TEMPLATES[(idx + i) % CASE_TEMPLATES.length];
          const createdAt = new Date(now - (idx * 86_400_000 + i * 3_600_000)).toISOString();

          const baseCase: Record<string, unknown> = {
            user_id: companyId,
            analysis_text: t.analysis,
            solution_steps: t.steps,
            original_priority: t.priority,
            priority_override: {},
          };

          let caseInsert = await service
            .from("ai_cases")
            .insert({
              ...baseCase,
              company_id: companyId,
              tenant_id: companyId,
              machine_id: m.id,
            })
            .select("id")
            .maybeSingle();

          if (
            caseInsert.error?.message?.includes("column ai_cases.company_id does not exist") ||
            caseInsert.error?.message?.includes("column ai_cases.tenant_id does not exist") ||
            caseInsert.error?.message?.includes("column ai_cases.machine_id does not exist")
          ) {
            caseInsert = await service
              .from("ai_cases")
              .insert(baseCase)
              .select("id")
              .maybeSingle();
          }
          if (caseInsert.error) {
            throw new Error(`ai_cases insert: ${caseInsert.error.message}`);
          }
          const aiCaseId = (caseInsert.data as { id?: string } | null)?.id ?? null;
          if (aiCaseId) {
            created.ai_cases += 1;
            const ml = await service.from("machine_logs").insert({
              machine_id: m.id,
              ai_case_id: aiCaseId,
              created_at: createdAt,
            });
            if (ml.error) {
              throw new Error(`machine_logs insert: ${ml.error.message}`);
            }
            created.machine_logs += 1;

            await logEvent(
              `demo_${t.action}`,
              `${m.serial_number}: ${t.detail}`,
              {
                machine_id: m.id,
                serial_number: m.serial_number,
                source: "demo_seed_rich",
              },
              {
                service,
                userId: null,
                companyId,
                tenantId: companyId,
              },
            );
          }
        }
      }
    }
  }

  return { created };
}
