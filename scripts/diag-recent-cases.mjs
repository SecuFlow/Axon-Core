import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnvFile(path.join(process.cwd(), ".env.production.local"));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL?.trim(), env.SUPABASE_SERVICE_ROLE_KEY?.trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const since = new Date(Date.now() - 30 * 86400000).toISOString();
const { data: cases, error } = await sb
  .from("ai_cases")
  .select("id, created_at, user_id, mandant_id, tenant_id, company_id, machine_name")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(40);
if (error) throw error;

const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const byId = new Map((list?.users ?? []).map((u) => [u.id, u.email]));

const SIEMENS = "3a4086f4-0444-4152-938d-7656de54753a";

console.log(
  JSON.stringify(
    {
      total: cases?.length ?? 0,
      siemensMandant: (cases ?? []).filter((c) => c.mandant_id === SIEMENS).length,
      rows: (cases ?? []).map((c) => ({
        id: c.id,
        created_at: c.created_at,
        email: byId.get(c.user_id) ?? c.user_id,
        mandant_id: c.mandant_id,
        tenant_id: c.tenant_id,
        company_id: c.company_id,
        machine_name: c.machine_name,
      })),
    },
    null,
    2,
  ),
);
