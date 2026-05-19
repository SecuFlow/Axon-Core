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

const SIEMENS_TENANT = "3a4086f4-0444-4152-938d-7656de54753a";
const email = "elias.stadler@gmail.com";

const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const user = (list?.users ?? []).find(
  (u) => String(u.email ?? "").toLowerCase() === email,
);
if (!user) throw new Error("user not found");

const { data: prof } = await sb
  .from("profiles")
  .select("company_id, tenant_id, mandant_id")
  .eq("id", user.id)
  .maybeSingle();

const { data: cases } = await sb
  .from("ai_cases")
  .select("id, created_at, mandant_id, tenant_id, company_id, user_id, machine_name, analysis_text")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(15);

const { data: casesSiemens } = await sb
  .from("ai_cases")
  .select("id", { count: "exact", head: true })
  .eq("mandant_id", SIEMENS_TENANT);

const { data: casesWrongPk } = await sb
  .from("ai_cases")
  .select("id", { count: "exact", head: true })
  .eq("mandant_id", prof?.company_id ?? "none");

console.log(
  JSON.stringify(
    {
      workerProfile: prof,
      siemensTenant: SIEMENS_TENANT,
      recentCases: cases,
      countMandantSiemens: casesSiemens,
      countMandantEqualsCompanyPk: casesWrongPk,
    },
    null,
    2,
  ),
);
