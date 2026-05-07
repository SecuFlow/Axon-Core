import { NextResponse } from "next/server";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTruthy(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

function looksLikeDemoCompanyName(raw: string): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return true;
  if (s.startsWith("demo:")) return true;
  if (/(^|\b)(demo|test|testing|placeholder|sample|beispiel)(\b|$)/i.test(s)) return true;
  return false;
}

/**
 * Alle Konzern-Zeilen (companies) für Zuweisungs-Dropdowns — nur Plattform-Admin.
 * Wird beim Öffnen des Zuweisen-Modals geladen.
 */
export async function GET(request: Request) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  // Standard: Demos ausblenden. Bei Bedarf `?include_demo=1`.
  const url = new URL(request.url);
  const includeDemo = ["1", "true", "yes"].includes(
    (url.searchParams.get("include_demo") ?? "").trim().toLowerCase(),
  );

  const { data, error } = await ctx.service
    .from("companies")
    .select("id, name, tenant_id, demo_slug, is_demo_active")
    .order("name", { ascending: true });

  if (error) {
    // Fallback für Legacy-Schemas ohne Demo-Spalten
    if (
      error.message.includes("demo_slug") ||
      error.message.includes("is_demo_active") ||
      error.message.includes("show_cta")
    ) {
      const fb = await ctx.service
        .from("companies")
        .select("id, name, tenant_id")
        .order("name", { ascending: true });
      if (fb.error) {
        return NextResponse.json({ error: fb.error.message }, { status: 500 });
      }
      const companies = (fb.data ?? []).map((row) => {
        const r = row as { id?: string; name?: string | null; tenant_id?: string | null };
        return {
          id: r.id as string,
          name:
            typeof r.name === "string" && r.name.trim().length > 0
              ? r.name.trim()
              : "Konzern",
          tenant_id:
            typeof r.tenant_id === "string" && r.tenant_id.length > 0
              ? r.tenant_id
              : null,
        };
      });
      // Ohne Demo-Felder können wir nur über den Namen filtern.
      const filtered = includeDemo
        ? companies
        : companies.filter((c) => !looksLikeDemoCompanyName(c.name));
      return NextResponse.json({ companies: filtered });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rawCompanies = (data ?? []).map((row) => {
    const r = row as {
      id?: string;
      name?: string | null;
      tenant_id?: string | null;
      demo_slug?: string | null;
      is_demo_active?: boolean | null;
    };
    return {
      id: r.id as string,
      name:
        typeof r.name === "string" && r.name.trim().length > 0
          ? r.name.trim()
          : "Konzern",
      tenant_id:
        typeof r.tenant_id === "string" && r.tenant_id.length > 0
          ? r.tenant_id
          : null,
      demo_slug: typeof r.demo_slug === "string" ? r.demo_slug : null,
      is_demo_active: isTruthy(r.is_demo_active),
    };
  });

  const companies = includeDemo
    ? rawCompanies.map(({ demo_slug, is_demo_active, ...rest }) => rest)
    : rawCompanies
        .filter((c) => {
          if (c.is_demo_active) return false;
          if (typeof c.demo_slug === "string" && c.demo_slug.trim().length > 0) return false;
          return true;
        })
        .map(({ demo_slug, is_demo_active, ...rest }) => rest);

  return NextResponse.json({ companies });
}
