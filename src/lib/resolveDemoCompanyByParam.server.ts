import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDemoSeedRich } from "@/lib/demoSeedRich.server";
import { isUuidDemoParam } from "@/lib/demoPublicSlug";

/** Slug für Auto-Create (nur [a-z0-9-], 1–64 Zeichen, nicht `true`). */
export function isValidDemoSlugForAutoCreate(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s || s === "true") return false;
  if (s.length > 64) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s);
}

function normalizeDomain(input: string): string | null {
  const s = (input ?? "").trim().toLowerCase();
  if (!s) return null;
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      const u = new URL(s);
      return u.hostname?.toLowerCase() || null;
    }
  } catch {
    // ignore
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

function demoCompanyName(domain: string) {
  return `DEMO:${domain}`;
}

export type DemoCompanyRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  demo_slug?: string | null;
  is_demo_active?: boolean | null;
  show_cta?: boolean | null;
};

export type ResolveDemoCompanyResult =
  | { ok: true; row: DemoCompanyRow; companyId: string }
  | { ok: false; status: number; message: string };

export type ResolveDemoCompanyOptions = {
  /**
   * Branding & Gast-Demo-APIs: Firma zurückgeben, sobald sie existiert — auch bei
   * `is_demo_active === false` (Link/QR bleiben nutzbar).
   */
  allowInactiveDemo?: boolean;
};

function blockIfDemoInactive(
  row: DemoCompanyRow,
  opts: ResolveDemoCompanyOptions,
): ResolveDemoCompanyResult | null {
  if (opts.allowInactiveDemo) return null;
  if (row.is_demo_active === false) {
    return { ok: false, status: 403, message: "Demo ist nicht aktiv." };
  }
  return null;
}

/**
 * `company`-Parameter wie in `/demo?company=` / `/api/demo/data`:
 * - UUID → direkte Firmenzeile
 * - gültige Domain → Legacy `DEMO:<domain>`
 * - sonst → `companies.demo_slug` (z. B. „siemens“)
 */
export async function resolveDemoCompanyByParam(
  service: SupabaseClient,
  rawInput: string,
  options: ResolveDemoCompanyOptions = {},
): Promise<ResolveDemoCompanyResult> {
  const t = rawInput.trim();
  if (!t) {
    return { ok: false, status: 400, message: "company fehlt/ungültig." };
  }

  const selectBase = "id, tenant_id, name, brand_name, logo_url, primary_color";
  const selectWithDemo = `${selectBase}, demo_slug, is_demo_active, show_cta`;

  if (isUuidDemoParam(t)) {
    let res = await service
      .from("companies")
      .select(selectWithDemo)
      .eq("id", t)
      .maybeSingle();
    if (
      res.error?.message?.includes("demo_slug") ||
      res.error?.message?.includes("is_demo_active") ||
      res.error?.message?.includes("show_cta")
    ) {
      res = await service
        .from("companies")
        .select(selectBase)
        .eq("id", t)
        .maybeSingle();
    }
    if (res.error) {
      return { ok: false, status: 500, message: res.error.message };
    }
    const row = res.data as DemoCompanyRow | null;
    if (!row?.id) {
      return { ok: false, status: 404, message: "Firma nicht gefunden." };
    }
    const blocked = blockIfDemoInactive(row, options);
    if (blocked) return blocked;
    return { ok: true, row, companyId: row.id };
  }

  const domain = normalizeDomain(t);
  if (domain) {
    const name = demoCompanyName(domain);
    let res = await service
      .from("companies")
      .select(selectWithDemo)
      .eq("name", name)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      res.error?.message?.includes("demo_slug") ||
      res.error?.message?.includes("is_demo_active") ||
      res.error?.message?.includes("show_cta")
    ) {
      res = await service
        .from("companies")
        .select(selectBase)
        .eq("name", name)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    if (res.error) {
      return { ok: false, status: 500, message: res.error.message };
    }
    const row = res.data as DemoCompanyRow | null;
    if (!row?.id) {
      return {
        ok: false,
        status: 404,
        message: "Demo-Firma nicht gefunden. Bitte zuerst Demo generieren.",
      };
    }
    const blockedDomain = blockIfDemoInactive(row, options);
    if (blockedDomain) return blockedDomain;
    return { ok: true, row, companyId: row.id };
  }

  const slug = t.toLowerCase();
  let resSlug = await service
    .from("companies")
    .select(selectWithDemo)
    .eq("demo_slug", slug)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    resSlug.error?.message?.includes("show_cta") ||
    resSlug.error?.message?.includes("demo_slug") ||
    resSlug.error?.message?.includes("is_demo_active")
  ) {
    resSlug = await service
      .from("companies")
      .select(`${selectBase}, demo_slug, is_demo_active`)
      .eq("demo_slug", slug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  const data = resSlug.data;
  const error = resSlug.error;

  if (error) {
    // Schema cache noch nicht aktualisiert → Demo-Slug-Query überspringen.
    if (error.message.includes("demo_slug") && error.message.includes("schema cache")) {
      return { ok: false, status: 503, message: "Demo-Slug-Spalte noch nicht im API-Cache. Bitte kurz warten und neu laden." };
    }
    return { ok: false, status: 500, message: error.message };
  }
  const row = data as DemoCompanyRow | null;
  if (!row?.id) {
    if (!isValidDemoSlugForAutoCreate(slug)) {
      return { ok: false, status: 404, message: "Firma für diesen Slug nicht gefunden." };
    }
    return insertAutoDemoCompanyRow(service, slug, selectWithDemo, selectBase, options);
  }
  const blockedSlug = blockIfDemoInactive(row, options);
  if (blockedSlug) return blockedSlug;
  return { ok: true, row, companyId: row.id };
}

async function insertAutoDemoCompanyRow(
  service: SupabaseClient,
  slug: string,
  selectWithDemo: string,
  selectBase: string,
  options: ResolveDemoCompanyOptions,
): Promise<ResolveDemoCompanyResult> {
  const primary =
    (typeof process.env.AXON_DEMO_DEFAULT_PRIMARY === "string" &&
      process.env.AXON_DEMO_DEFAULT_PRIMARY.trim()) ||
    "#6366f1";
  const brandName =
    slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || slug;

  const payload = {
    demo_slug: slug,
    is_demo_active: true,
    show_cta: true,
    name: `Demo: ${slug}`,
    brand_name: brandName,
    primary_color: primary,
  };

  let ins = await service.from("companies").insert(payload).select(selectWithDemo).single();

  if (
    ins.error?.message?.includes("show_cta") ||
    ins.error?.message?.includes("demo_slug")
  ) {
    ins = await service.from("companies").insert(payload).select(`${selectBase}, demo_slug, is_demo_active`).single();
  }

  if (ins.error?.code === "23505" || ins.error?.message?.toLowerCase().includes("duplicate")) {
    const retry = await service
      .from("companies")
      .select(selectWithDemo)
      .eq("demo_slug", slug)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const retryRow = retry.data as DemoCompanyRow | null;
    if (!retry.error && retryRow?.id) {
      const r = retryRow;
      const blocked = blockIfDemoInactive(r, options);
      if (blocked) return blocked;
      try {
        await ensureDemoSeedRich(service, r.id, slug);
      } catch (err) {
        console.warn("[resolveDemoCompanyByParam] ensureDemoSeedRich (retry):", err);
      }
      return { ok: true, row: r, companyId: r.id };
    }
  }

  if (ins.error) {
    return { ok: false, status: 500, message: ins.error.message };
  }

  const r = ins.data as unknown as DemoCompanyRow | null;
  if (!r?.id) {
    return { ok: false, status: 500, message: "Demo-Firma konnte nicht angelegt werden." };
  }
  const blockedIns = blockIfDemoInactive(r, options);
  if (blockedIns) return blockedIns;
  try {
    await ensureDemoSeedRich(service, r.id, slug);
  } catch (err) {
    console.warn("[resolveDemoCompanyByParam] ensureDemoSeedRich (insert):", err);
  }
  return { ok: true, row: r, companyId: r.id };
}
