import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(absPath) {
  const raw = fs.readFileSync(absPath, "utf8");
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function uniq(arr) {
  return [...new Set(arr)];
}

async function main() {
  const envPath = path.join(process.cwd(), ".env.production.local");
  const env = loadEnvFile(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.production.local",
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Auth users
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const users = list.users ?? [];

  // 2) Companies (all)
  const { data: companies, error: coErr } = await sb
    .from("companies")
    .select("id, user_id, tenant_id, role, name, created_at");
  if (coErr) throw coErr;

  /** @type {Map<string, Array<any>>} */
  const companiesByUser = new Map();
  for (const row of companies ?? []) {
    const uid = row.user_id;
    if (!uid) continue;
    const arr = companiesByUser.get(uid) ?? [];
    arr.push(row);
    companiesByUser.set(uid, arr);
  }

  // 3) Profiles (subset: ids)
  const ids = users.map((u) => u.id);
  const { data: profiles, error: profErr } = await sb
    .from("profiles")
    .select("id, role, tenant_id, mandant_id, company_id")
    .in("id", ids);
  if (profErr) throw profErr;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  /** @type {Array<any>} */
  const findings = [];
  for (const u of users) {
    const uid = u.id;
    const email = u.email ?? null;
    const prof = profileById.get(uid) ?? null;
    const cos = companiesByUser.get(uid) ?? [];
    if (cos.length <= 1) continue;

    const tenantIds = uniq(
      cos
        .map((c) => (typeof c.tenant_id === "string" ? c.tenant_id.trim() : ""))
        .filter(Boolean),
    );
    const roles = uniq(cos.map((c) => String(c.role ?? "").trim()).filter(Boolean));

    const profTenant =
      (typeof prof?.mandant_id === "string" && prof.mandant_id.trim()) ||
      (typeof prof?.tenant_id === "string" && prof.tenant_id.trim()) ||
      null;

    // Flag: multiple tenants for same user
    const multiTenant = tenantIds.length > 1;

    // Flag: profile tenant not represented by any company tenant
    const tenantMismatch =
      profTenant && tenantIds.length > 0 ? !tenantIds.includes(profTenant) : false;

    if (multiTenant || tenantMismatch) {
      findings.push({
        userId: uid,
        email,
        profileTenant: profTenant,
        companyTenants: tenantIds,
        companyRoles: roles,
        companyCount: cos.length,
      });
    }
  }

  findings.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  console.log(
    JSON.stringify(
      {
        ok: true,
        totalAuthUsers: users.length,
        flaggedUsers: findings.length,
        findings,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

