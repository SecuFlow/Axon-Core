import { NextResponse } from "next/server";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MachineRow = {
  id: string;
  name: string | null;
  integration_id: string | null;
  company_id: string | null;
};

type IntegrationSummary = {
  id: string;
  category: string;
  provider: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
};

/**
 * Mapping machine_id → Integration für den Mandanten.
 * Ohne Kopplung: machine_id landet nicht im Mapping (Frontend zeigt dann KI-Fallback).
 */
export async function GET() {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const { service } = ctx;
  const actorMandantId = ctx.isAdmin
    ? null
    : await resolveActorMandantId(service, ctx.userId);

  if (!ctx.isAdmin && !actorMandantId) {
    return NextResponse.json({ error: "Kein Mandanten-Kontext." }, { status: 403 });
  }

  const integrationSelect =
    "id, category, provider, display_name, status, last_sync_at, mandant_id";

  const integrationRes =
    !ctx.isAdmin && actorMandantId
      ? await service
          .from("integrations")
          .select(integrationSelect)
          .eq("mandant_id", actorMandantId)
      : await service.from("integrations").select(integrationSelect);
  if (integrationRes.error) {
    const msg = integrationRes.error.message.toLowerCase();
    if (msg.includes('relation "public.integrations"')) {
      return NextResponse.json({
        machines: {},
        integrations: {},
        migration_required: true,
      });
    }
    return NextResponse.json(
      { error: integrationRes.error.message },
      { status: 500 },
    );
  }

  const integrations = (integrationRes.data ?? []) as IntegrationSummary[];
  const integrationById = new Map<string, IntegrationSummary>();
  for (const row of integrations) {
    integrationById.set(row.id, row);
  }

  const { data: machinesRaw, error: mErr } = await service
    .from("machines")
    .select("id, name, integration_id, company_id");

  if (mErr) {
    if (mErr.message.includes("integration_id")) {
      return NextResponse.json({
        machines: {},
        integrations: Object.fromEntries(
          integrations.map((i) => [i.id, i]),
        ),
        migration_required: true,
      });
    }
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const machineMap: Record<string, IntegrationSummary> = {};
  for (const row of (machinesRaw ?? []) as MachineRow[]) {
    if (!row.integration_id) continue;
    const integ = integrationById.get(row.integration_id);
    if (!integ) continue;
    machineMap[row.id] = integ;
  }

  return NextResponse.json({
    machines: machineMap,
    integrations: Object.fromEntries(integrations.map((i) => [i.id, i])),
  });
}
