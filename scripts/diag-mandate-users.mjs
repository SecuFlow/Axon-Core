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

const emails = process.argv.slice(2);
if (emails.length === 0) {
  emails.push("eliasstadler988@gmail.com", "elias.stadler@gmail.com");
}

const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });

for (const email of emails) {
  const u = (list?.users ?? []).find(
    (x) => String(x.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!u) {
    console.log("\n=== MISSING", email);
    continue;
  }
  const { data: prof } = await sb
    .from("profiles")
    .select("id, role, company_id, tenant_id, mandant_id, location_id")
    .eq("id", u.id)
    .maybeSingle();

  let companyByPk = null;
  if (prof?.company_id) {
    const { data } = await sb
      .from("companies")
      .select("id, name, tenant_id, mandant_id")
      .eq("id", prof.company_id)
      .maybeSingle();
    companyByPk = data;
  }

  let loc = null;
  if (prof?.location_id) {
    const { data } = await sb
      .from("locations")
      .select("id, name, company_id")
      .eq("id", prof.location_id)
      .maybeSingle();
    loc = data;
  }

  const { data: cosByUser } = await sb
    .from("companies")
    .select("id, name, tenant_id, role, created_at")
    .eq("user_id", u.id)
    .order("created_at", { ascending: true });

  console.log("\n===", email);
  console.log(JSON.stringify({ userId: u.id, profile: prof, companyByPk, location: loc, companiesUserRows: cosByUser }, null, 2));
}

const { data: siemens } = await sb
  .from("companies")
  .select("id, name, tenant_id")
  .ilike("name", "%siemens%");
const { data: rhi } = await sb
  .from("companies")
  .select("id, name, tenant_id")
  .ilike("name", "%rhi%");

console.log("\n=== COMPANIES matching Siemens");
console.log(JSON.stringify(siemens, null, 2));
console.log("\n=== COMPANIES matching RHI");
console.log(JSON.stringify(rhi, null, 2));
