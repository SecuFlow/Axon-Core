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

function looksLikeEmailName(raw) {
  const s = String(raw ?? "").trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function main() {
  const email = String(process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Usage: node scripts/fix-profile-company.mjs <email>");
  }

  const envPath = path.join(process.cwd(), ".env.production.local");
  const env = loadEnvFile(envPath);
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.production.local");
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list, error: listErr } = await sb.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;

  const user = (list.users ?? []).find(
    (u) => String(u.email ?? "").toLowerCase() === email,
  );
  if (!user) throw new Error(`User not found: ${email}`);

  const userId = user.id;

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("id, company_id, tenant_id, mandant_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;

  const tenantId = String(prof?.tenant_id ?? "").trim() || String(prof?.mandant_id ?? "").trim();
  if (!tenantId) {
    throw new Error("Profile has no tenant_id/mandant_id; cannot resolve company.");
  }

  const { data: companies, error: coErr } = await sb
    .from("companies")
    .select("id, name, tenant_id, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(25);
  if (coErr) throw coErr;

  const pick =
    (companies ?? []).find((c) => c?.name && !looksLikeEmailName(c.name)) ??
    (companies ?? [])[0];
  if (!pick?.id) throw new Error(`No companies row found for tenant_id=${tenantId}`);

  const patchBase = {
    company_id: pick.id,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };

  // Prefer also setting mandant_id (new schema). Fallback gracefully for legacy DBs.
  let upd = await sb
    .from("profiles")
    .update({ ...patchBase, mandant_id: tenantId })
    .eq("id", userId);
  if (upd.error?.message?.includes("mandant_id")) {
    upd = await sb.from("profiles").update(patchBase).eq("id", userId);
  }
  if (upd.error) throw upd.error;

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        userId,
        tenantId,
        fromCompanyId: prof?.company_id ?? null,
        toCompanyId: pick.id,
        companyName: pick.name ?? null,
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

