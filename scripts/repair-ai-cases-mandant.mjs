/**
 * Repariert ai_cases mit falscher mandant_id (z. B. companies-PK oder user_id statt tenant_id).
 *
 *   node scripts/repair-ai-cases-mandant.mjs
 *   node scripts/repair-ai-cases-mandant.mjs "Siemens"
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

const env = loadEnvFile(path.join(process.cwd(), ".env.production.local"));
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const nameQuery = String(process.argv[2] ?? "Siemens").trim();

const { data: companies } = await sb
  .from("companies")
  .select("id, name, tenant_id")
  .ilike("name", `%${nameQuery}%`);

const targets = (companies ?? []).filter(
  (c) => c?.tenant_id && c?.name && !String(c.name).includes("@"),
);

let repaired = 0;
let skipped = 0;

for (const co of targets) {
  const tenantId = co.tenant_id;
  const pk = co.id;

  const { data: wrong } = await sb
    .from("ai_cases")
    .select("id, mandant_id, tenant_id, company_id, user_id")
    .or(`mandant_id.eq.${pk},company_id.eq.${pk},user_id.eq.${tenantId}`)
    .neq("mandant_id", tenantId)
    .limit(500);

  for (const row of wrong ?? []) {
    const { error } = await sb
      .from("ai_cases")
      .update({
        tenant_id: tenantId,
        company_id: tenantId,
      })
      .eq("id", row.id);

    if (error) {
      console.error("FAIL", row.id, error.message);
      skipped += 1;
      continue;
    }
    repaired += 1;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      companies: targets.map((c) => ({ id: c.id, name: c.name, tenant_id: c.tenant_id })),
      repaired,
      skipped,
    },
    null,
    2,
  ),
);
