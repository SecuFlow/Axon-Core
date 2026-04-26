import { NextRequest, NextResponse } from "next/server";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";
import { logEvent } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ctx = await requireKonzernTenantContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const actorMandantId = ctx.isAdmin
    ? null
    : await resolveActorMandantId(ctx.service, ctx.userId);
  if (!ctx.isAdmin && !actorMandantId) {
    return NextResponse.json({ error: "Kein Mandanten-Kontext." }, { status: 403 });
  }

  const canEditSerial = ctx.isAdmin || ctx.companyRole === "manager";
  if (!canEditSerial) {
    return NextResponse.json(
      { error: "Seriennummer darf nur von Manager oder Admin geaendert werden." },
      { status: 403 },
    );
  }

  const { id: machineId } = await context.params;
  if (!machineId) {
    return NextResponse.json({ error: "Maschinen-ID fehlt." }, { status: 400 });
  }

  let serial_number = "";
  try {
    const body = (await request.json()) as { serial_number?: string };
    serial_number = (body.serial_number ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  if (!serial_number) {
    return NextResponse.json({ error: "Seriennummer fehlt." }, { status: 400 });
  }

  const { data: machine, error: fetchErr } = await ctx.service
    .from("machines")
    .select("id, mandant_id, company_id, serial_number")
    .eq("id", machineId)
    .maybeSingle();

  if (fetchErr || !machine) {
    return NextResponse.json(
      { error: fetchErr?.message ?? "Maschine nicht gefunden." },
      { status: fetchErr ? 500 : 404 },
    );
  }

  const row = machine as {
    id: string;
    mandant_id?: string | null;
    company_id?: string | null;
    serial_number: string;
  };
  const machineMandantId =
    (typeof row.mandant_id === "string" && row.mandant_id) ||
    (typeof row.company_id === "string" && row.company_id) ||
    null;

  if (!ctx.isAdmin && actorMandantId && actorMandantId !== machineMandantId) {
    void logEvent(
      "security.mandant_mismatch",
      "Zugriff auf Maschine verweigert (Mandanten-Mismatch).",
      {
        resource: "machines",
        machine_id: machineId,
        actor_mandant_id: actorMandantId,
        record_mandant_id: machineMandantId,
      },
      { service: ctx.service, userId: ctx.userId, tenantId: actorMandantId },
    );
    return NextResponse.json({ error: "Kein Zugriff auf diese Maschine." }, { status: 403 });
  }

  const { error: upErr } = await ctx.service
    .from("machines")
    .update({
      serial_number,
      updated_at: new Date().toISOString(),
    })
    .eq("id", machineId);

  if (upErr) {
    if (upErr.message.includes("unique") || upErr.code === "23505") {
      return NextResponse.json(
        { error: "Seriennummer ist in diesem Mandanten bereits vergeben." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, serial_number });
}
