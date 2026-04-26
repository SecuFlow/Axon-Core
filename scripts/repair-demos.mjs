/**
 * Demo-Reparatur-Skript.
 *
 * Führt drei Aktionen pro Firma aus:
 *  - reseed: füllt fehlende Locations / AI-Cases / Machine-Logs nach (idempotent, additiv)
 *  - activate: setzt is_demo_active=true
 *  - delete: löscht Firma + alle abhängigen Demo-Daten (cascade)
 *
 * Modi:
 *   DRY-RUN (default):
 *     node --env-file=.env.production.local scripts/repair-demos.mjs
 *
 *   LIVE:
 *     node --env-file=.env.production.local scripts/repair-demos.mjs --apply
 */

const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\s/g, "") ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s/g, "") ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("FEHLER: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function rest(method, path, body, extraHeaders = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${method} ${path} → ${r.status}\n${t}`);
  }
  if (r.status === 204) return null;
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return r.json();
  return null;
}

const SEP = "─".repeat(78);

const PLAN = {
  reseed: [
    { id: "571303e0-5234-4dc6-922a-f4321dc69cb3", label: "Demo: siemens", slug: "siemens" },
    {
      id: "34bd3481-77ff-4cb5-8ec8-02ac9f2eaf35",
      label: "DEMO:microsoft.com",
      slug: "demo-microsoft-com",
    },
    {
      id: "46271998-5440-4a51-be0e-38e208473dce",
      label: "DEMO:apple.com",
      slug: "demo-apple-com",
    },
  ],
  activate: [
    { id: "f20069fc-fc91-43d7-8089-d11a7f13fd7b", label: "DEMO:siemens.com" },
    { id: "bfa42026-6102-40a8-a3e7-3ed39ab7584e", label: "DEMO:google.com" },
  ],
  delete: [
    // 'Axon Core HQ' (339fa665-…) ausgeschlossen: hat ein echtes Profile dran und ist
    // ein interner Test-Mandant. Bleibt mit is_demo_active=false stehen.
    { id: "fd6dcac6-271b-4a97-8187-7125b7a3cbb4", label: "Apple Demo" },
  ],
};

const CASE_TEMPLATES = [
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

function safeSerialToken(label) {
  return label.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 18);
}

async function reseedCompany({ id, label, slug }) {
  console.log(`\n[reseed] ${label} (id=${id}, slug=${slug})`);
  const counters = { machines: 0, locations: 0, ai_cases: 0, machine_logs: 0 };
  const serialBase = safeSerialToken(slug || label);

  let machines = await rest("GET", `machines?company_id=eq.${id}&select=id,serial_number,location_id`);
  if (machines.length === 0) {
    console.log("  → 0 Maschinen, lege 3 an");
    if (APPLY) {
      machines = await rest(
        "POST",
        "machines?select=id,serial_number,location_id",
        [
          { company_id: id, serial_number: `DEMO-${serialBase}-S7`, name: "Spritzgussmaschine S7", status: "active" },
          { company_id: id, serial_number: `DEMO-${serialBase}-FB`, name: "Förderband Alpha", status: "maintenance" },
          { company_id: id, serial_number: `DEMO-${serialBase}-R1`, name: "Industrieroboter R1", status: "active" },
        ],
        { Prefer: "return=representation" },
      );
      counters.machines = machines.length;
    } else {
      counters.machines = 3;
    }
  } else {
    console.log(`  → ${machines.length} Maschinen vorhanden, kein Insert`);
  }

  const locations = await rest("GET", `locations?company_id=eq.${id}&select=id&order=created_at.asc&limit=1`);
  let primaryLocId = locations[0]?.id ?? null;
  if (!primaryLocId) {
    console.log("  → keine Location, lege 'Hauptwerk' an");
    if (APPLY) {
      const ins = await rest(
        "POST",
        "locations?select=id",
        [{ company_id: id, name: "Hauptwerk", address: `Demo-Standort für ${slug}` }],
        { Prefer: "return=representation" },
      );
      primaryLocId = ins[0]?.id ?? null;
      counters.locations = 1;
    } else {
      counters.locations = 1;
    }
  } else {
    console.log(`  → Location vorhanden (${primaryLocId})`);
  }

  if (primaryLocId && machines.length > 0) {
    const without = machines.filter((m) => !m.location_id);
    if (without.length > 0) {
      console.log(`  → ${without.length} Maschinen ohne location_id → weise '${primaryLocId}' zu`);
      if (APPLY) {
        const idList = without.map((m) => `"${m.id}"`).join(",");
        await rest("PATCH", `machines?id=in.(${idList})`, { location_id: primaryLocId });
      }
    }
  }

  if (machines.length > 0) {
    const idList = machines.map((m) => `"${m.id}"`).join(",");
    const existingCases = await rest(
      "GET",
      `ai_cases?machine_id=in.(${idList})&select=id&limit=1`,
    );
    if (existingCases.length === 0) {
      console.log(`  → 0 AI-Cases für ${machines.length} Maschinen, lege Cases + Logs an`);
      const now = Date.now();
      for (let mi = 0; mi < machines.length; mi += 1) {
        const m = machines[mi];
        const count = 2 + (mi % 2);
        for (let i = 0; i < count; i += 1) {
          const t = CASE_TEMPLATES[(mi + i) % CASE_TEMPLATES.length];
          const createdAt = new Date(now - (mi * 86_400_000 + i * 3_600_000)).toISOString();
          counters.ai_cases += 1;
          counters.machine_logs += 1;
          if (APPLY) {
            const caseRes = await rest(
              "POST",
              "ai_cases?select=id",
              [
                {
                  user_id: id,
                  company_id: id,
                  tenant_id: id,
                  machine_id: m.id,
                  analysis_text: t.analysis,
                  solution_steps: t.steps,
                  original_priority: t.priority,
                  priority_override: {},
                },
              ],
              { Prefer: "return=representation" },
            );
            const caseId = caseRes[0]?.id;
            if (caseId) {
              await rest(
                "POST",
                "machine_logs",
                [{ machine_id: m.id, ai_case_id: caseId, created_at: createdAt }],
              );
            }
          }
        }
      }
    } else {
      console.log("  → AI-Cases vorhanden, überspringe Seeding");
    }
  }

  console.log(`  ✓ counters: ${JSON.stringify(counters)}`);
}

async function activateCompany({ id, label }) {
  console.log(`\n[activate] ${label} (id=${id})`);
  if (APPLY) {
    await rest("PATCH", `companies?id=eq.${id}`, { is_demo_active: true });
    console.log("  ✓ is_demo_active=true gesetzt");
  } else {
    console.log("  → würde is_demo_active=true setzen");
  }
}

async function deleteCompany({ id, label }) {
  console.log(`\n[delete] ${label} (id=${id})`);

  // Vorab-Check, was dranhängt
  const machines = await rest("GET", `machines?company_id=eq.${id}&select=id`);
  const machineIds = machines.map((m) => m.id);
  const machineIdList = machineIds.length > 0 ? machineIds.map((m) => `"${m}"`).join(",") : null;

  console.log(`  Abhängigkeiten:`);
  console.log(`    - machines:           ${machines.length}`);
  if (machineIdList) {
    const logs = await rest("GET", `machine_logs?machine_id=in.(${machineIdList})&select=id&limit=1000`);
    console.log(`    - machine_logs:       ${logs.length}`);
  }
  const cases = await rest("GET", `ai_cases?company_id=eq.${id}&select=id&limit=1000`);
  console.log(`    - ai_cases:           ${cases.length}`);
  const locs = await rest("GET", `locations?company_id=eq.${id}&select=id&limit=1000`);
  console.log(`    - locations:          ${locs.length}`);
  const audit = await rest("GET", `audit_logs?company_id=eq.${id}&select=id&limit=1000`);
  console.log(`    - audit_logs:         ${audit.length}`);
  const demoLinks = await rest("GET", `demo_access_links?company_id=eq.${id}&select=token&limit=100`);
  console.log(`    - demo_access_links:  ${demoLinks.length}`);
  const branding = await rest("GET", `branding?company_id=eq.${id}&select=id&limit=10`);
  console.log(`    - branding:           ${branding.length}`);
  const profiles = await rest("GET", `profiles?company_id=eq.${id}&select=id&limit=100`);
  console.log(`    - profiles:           ${profiles.length}`);

  if (!APPLY) {
    console.log("  → würde alle obigen + companies-Zeile löschen (cascade)");
    return;
  }

  if (machineIdList) {
    await rest("DELETE", `machine_logs?machine_id=in.(${machineIdList})`);
  }
  await rest("DELETE", `ai_cases?company_id=eq.${id}`);
  await rest("DELETE", `audit_logs?company_id=eq.${id}`);
  await rest("DELETE", `branding?company_id=eq.${id}`);
  await rest("DELETE", `demo_access_links?company_id=eq.${id}`);
  await rest("DELETE", `machines?company_id=eq.${id}`);
  await rest("DELETE", `locations?company_id=eq.${id}`);
  if (profiles.length > 0) {
    console.log(`  ⚠ ${profiles.length} profiles weisen auf diese Firma — setze company_id=null`);
    await rest("PATCH", `profiles?company_id=eq.${id}`, { company_id: null });
  }
  await rest("DELETE", `companies?id=eq.${id}`);
  console.log("  ✓ companies-Zeile + Abhängigkeiten gelöscht");
}

(async () => {
  console.log(SEP);
  console.log(APPLY ? "DEMO-REPARATUR · LIVE-MODUS" : "DEMO-REPARATUR · DRY-RUN");
  console.log(SEP);

  for (const c of PLAN.activate) {
    await activateCompany(c);
  }
  for (const c of PLAN.reseed) {
    await reseedCompany(c);
  }
  for (const c of PLAN.delete) {
    await deleteCompany(c);
  }

  console.log(`\n${SEP}`);
  if (APPLY) {
    console.log("FERTIG — wirf jetzt scripts/diag-demo.mjs zur Verifikation");
  } else {
    console.log("DRY-RUN abgeschlossen. Mit --apply für echte Ausführung.");
  }
  console.log(SEP);
})();
