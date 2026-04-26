/**
 * Diagnose-Skript für Demo-Firmen und ihre Daten.
 *
 * Verwendung:
 *   node --env-file=.env.local scripts/diag-demo.mjs
 */

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

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${path}\n${t}`);
  }
  return r.json();
}

async function count(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...headers, Prefer: "count=exact" },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${path}\n${t}`);
  }
  const range = r.headers.get("content-range") ?? "*/0";
  return Number(range.split("/")[1] ?? 0);
}

const SEP = "─".repeat(78);

console.log(`\n${SEP}`);
console.log("DEMO-DIAGNOSE");
console.log(SEP);

const demoCompanies = await rest(
  "companies?or=(demo_slug.not.is.null,name.like.DEMO:*)&select=id,name,brand_name,demo_slug,is_demo_active,logo_url,primary_color,tenant_id,created_at&order=created_at.desc",
);

console.log(`\nFirmen mit demo_slug ODER Name 'DEMO:%': ${demoCompanies.length}\n`);

if (demoCompanies.length === 0) {
  console.log("KEINE Demo-Firmen vorhanden.");
  console.log("→ Wenn jemand /dashboard/konzern?demo=siemens aufruft, wird die Firma");
  console.log("  via insertAutoDemoCompanyRow auto-erstellt UND geseedet.");
  console.log("  Das sollte funktionieren. Prüfe live, was passiert.");
  process.exit(0);
}

for (const c of demoCompanies) {
  const machineCount = await count(`machines?company_id=eq.${c.id}&select=id`);
  const aiCasesCount = await count(`ai_cases?company_id=eq.${c.id}&select=id`);
  const locationsCount = await count(`locations?company_id=eq.${c.id}&select=id`);
  const machineLogsRaw = await rest(
    `machines?company_id=eq.${c.id}&select=id`,
  );
  const machineIds = machineLogsRaw.map((m) => m.id);
  let logsCount = 0;
  if (machineIds.length > 0) {
    const idList = machineIds.map((id) => `"${id}"`).join(",");
    logsCount = await count(`machine_logs?machine_id=in.(${idList})&select=id`);
  }

  console.log(SEP);
  console.log(`  Firma:         ${c.name}`);
  console.log(`  ID:            ${c.id}`);
  console.log(`  Tenant-ID:     ${c.tenant_id ?? "(null)"}`);
  console.log(`  brand_name:    ${c.brand_name ?? "(null)"}`);
  console.log(`  logo_url:      ${c.logo_url ? "✓ gesetzt" : "✗ FEHLT"}`);
  console.log(`  primary_color: ${c.primary_color ?? "(null)"}`);
  console.log(`  demo_slug:     ${c.demo_slug ?? "(null)"}`);
  console.log(`  is_demo_active:${c.is_demo_active === true ? " ✓ true" : " ✗ false"}`);
  console.log(`  Maschinen:     ${machineCount} ${machineCount === 0 ? "✗ LEER" : "✓"}`);
  console.log(`  Locations:     ${locationsCount}`);
  console.log(`  AI-Cases:      ${aiCasesCount}`);
  console.log(`  Machine-Logs:  ${logsCount}`);
  console.log(`  Erstellt:      ${c.created_at}`);
}

console.log(SEP);
console.log("\nDEFAULT_DEMO_SLUG (env): " + (process.env.AXON_DEMO_DEFAULT_SLUG?.trim() || "(unset)"));
console.log("");
