import { NextResponse } from "next/server";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alle Konzern-Zeilen (companies) für Zuweisungs-Dropdowns — nur Plattform-Admin.
 * Wird beim Öffnen des Zuweisen-Modals geladen.
 */
export async function GET() {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  if (!ctx.isAdmin) {
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const { data, error } = await ctx.service
    .from("companies")
    .select("id, name, tenant_id")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const companies = (data ?? []).map((row) => {
    const r = row as {
      id?: string;
      name?: string | null;
      tenant_id?: string | null;
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
    };
  });

  return NextResponse.json({ companies });
}
