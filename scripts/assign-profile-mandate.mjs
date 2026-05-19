/**
 * Weist ein Profil einem Konzern (companies.id) + optional Standort zu.
 * Synchronisiert tenant_id und mandant_id aus der companies-Zeile.
 *
 *   node scripts/assign-profile-mandate.mjs <email> "<Konzernname>" ["<Standortname>"]
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

function looksLikeEmailName(raw) {
  const s = String(raw ?? "").trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

const email = String(process.argv[2] ?? "").trim().toLowerCase();
const companyQuery = String(process.argv[3] ?? "").trim();
const locationQuery = String(process.argv[4] ?? "").trim();

if (!email || !companyQuery) {
  console.error(
    'Usage: node scripts/assign-profile-mandate.mjs <email> "<Konzernname>" ["<Standortname>"]',
  );
  process.exit(1);
}

const env = loadEnvFile(path.join(process.cwd(), ".env.production.local"));
const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
const user = (list?.users ?? []).find(
  (u) => String(u.email ?? "").toLowerCase() === email,
);
if (!user) throw new Error(`User not found: ${email}`);

const { data: companies, error: coErr } = await sb
  .from("companies")
  .select("id, name, tenant_id")
  .ilike("name", `%${companyQuery.replace(/%/g, "")}%`)
  .order("name", { ascending: true });
if (coErr) throw coErr;

const company =
  (companies ?? []).find((c) => c?.name && !looksLikeEmailName(c.name)) ?? null;
if (!company?.id || !company.tenant_id) {
  throw new Error(`No company with tenant_id found for query: ${companyQuery}`);
}

let locationId = null;
if (locationQuery) {
  const { data: locs, error: locErr } = await sb
    .from("locations")
    .select("id, name, company_id")
    .eq("company_id", company.tenant_id)
    .ilike("name", `%${locationQuery.replace(/%/g, "")}%`);
  if (locErr) throw locErr;
  const loc = (locs ?? [])[0];
  if (!loc?.id) {
    throw new Error(
      `No location "${locationQuery}" for tenant ${company.tenant_id} (${company.name})`,
    );
  }
  locationId = loc.id;
}

const patch = {
  company_id: company.id,
  tenant_id: company.tenant_id,
  mandant_id: company.tenant_id,
  location_id: locationId,
  updated_at: new Date().toISOString(),
};

let upd = await sb.from("profiles").update(patch).eq("id", user.id);
if (upd.error?.message?.includes("mandant_id")) {
  const { mandant_id: _m, ...fb } = patch;
  upd = await sb.from("profiles").update(fb).eq("id", user.id);
}
if (upd.error) throw upd.error;

const { data: after } = await sb
  .from("profiles")
  .select("company_id, tenant_id, mandant_id, location_id")
  .eq("id", user.id)
  .maybeSingle();

console.log(
  JSON.stringify(
    {
      ok: true,
      email,
      userId: user.id,
      assignedCompany: { id: company.id, name: company.name, tenant_id: company.tenant_id },
      locationId,
      profileAfter: after,
    },
    null,
    2,
  ),
);
