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
  const input = String(process.argv[2] ?? "").trim();
  if (!input) {
    throw new Error('Usage: node scripts/verify-tenant-setup.mjs "<email|userId>"');
  }

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

  let userId = input;
  let email = null;

  if (input.includes("@")) {
    email = input.toLowerCase();
    const { data: list, error: listErr } = await sb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw listErr;
    const user = (list.users ?? []).find(
      (u) => String(u.email ?? "").toLowerCase() === email,
    );
    if (!user) throw new Error(`Auth user not found for email: ${email}`);
    userId = user.id;
  }

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("id, role, tenant_id, mandant_id, company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!prof?.id) throw new Error(`Profile not found for userId: ${userId}`);

  const tenantId =
    String(prof.mandant_id ?? "").trim() || String(prof.tenant_id ?? "").trim();
  if (!tenantId) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "profile_has_no_tenant",
          userId,
          email,
          profile: { tenant_id: prof.tenant_id ?? null, mandant_id: prof.mandant_id ?? null },
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const { data: companies, error: coErr } = await sb
    .from("companies")
    .select("id, name, tenant_id, role, user_id, created_at, is_subscribed, subscription_status, subscription_quantity")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(50);
  if (coErr) throw coErr;

  const realCompany =
    (companies ?? []).find((c) => c?.name && !looksLikeEmailName(c.name)) ?? null;
  const companyNameOk = Boolean(realCompany?.id);

  const { count: locationsCount, error: locErr } = await sb
    .from("locations")
    .select("id", { head: true, count: "exact" })
    .eq("company_id", tenantId);
  if (locErr) throw locErr;
  const hasLocation = (locationsCount ?? 0) > 0;

  // Manager-like = profile.role manager/admin oder irgendeine company.role manager/admin im Tenant
  const { data: profilesOnTenant, error: profTenantErr } = await sb
    .from("profiles")
    .select("id, role, tenant_id, mandant_id")
    .eq("mandant_id", tenantId)
    .limit(500);
  if (profTenantErr) throw profTenantErr;

  const managerLikeProfiles =
    (profilesOnTenant ?? []).filter((p) => {
      const r = String(p?.role ?? "").toLowerCase();
      return r === "manager" || r === "admin";
    }) ?? [];

  const managerLikeCompanies =
    (companies ?? []).filter((c) => {
      const r = String(c?.role ?? "").toLowerCase();
      return r === "manager" || r === "admin";
    }) ?? [];

  const hasManagerLikeUser = managerLikeProfiles.length > 0 || managerLikeCompanies.length > 0;

  const { data: brandingRow, error: brandErr } = await sb
    .from("branding")
    .select("tenant_id, brand_name, logo_url, primary_color")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (brandErr && !String(brandErr.message ?? "").includes("branding")) throw brandErr;

  const ok = companyNameOk && hasLocation && hasManagerLikeUser;

  const subRow = (companies ?? [])[0] ?? null;
  const subscriptionActive =
    subRow?.is_subscribed === true &&
    (String(subRow?.subscription_status ?? "")
      .trim()
      .toLowerCase() || "active") !== "canceled";

  console.log(
    JSON.stringify(
      {
        ok,
        userId,
        email,
        tenantId,
        checks: {
          company_name_ok: companyNameOk,
          has_location: hasLocation,
          has_manager_like_user: hasManagerLikeUser,
          branding_row_present: Boolean(brandingRow?.tenant_id),
          subscription_active: subscriptionActive,
        },
        details: {
          company_candidate: realCompany
            ? { id: realCompany.id, name: realCompany.name, role: realCompany.role ?? null }
            : null,
          locations_count: locationsCount ?? 0,
          subscription: subRow
            ? {
                is_subscribed: subRow.is_subscribed ?? null,
                subscription_status: subRow.subscription_status ?? null,
                subscription_quantity: subRow.subscription_quantity ?? null,
              }
            : null,
          manager_like_profiles: managerLikeProfiles.map((p) => p.id),
          manager_like_company_rows: managerLikeCompanies.map((c) => c.id),
          branding: brandingRow
            ? {
                brand_name: brandingRow.brand_name ?? null,
                primary_color: brandingRow.primary_color ?? null,
                logo_url: brandingRow.logo_url ?? null,
              }
            : null,
        },
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

