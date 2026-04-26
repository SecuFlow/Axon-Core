import { NextResponse } from "next/server";
import { summarizeMachineDashboard } from "@/lib/openai";
import { requireKonzernTenantContext } from "@/lib/konzernTenantContext";
import { resolveActorMandantId } from "@/lib/mandantScope";
import { logEvent } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUCCESS_MSG =
  "Bericht erfolgreich in Datenbank persistent gespeichert";

export async function POST(
  _request: Request,
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

  const { id: machineId } = await context.params;
  if (!machineId) {
    return NextResponse.json({ error: "Maschinen-ID fehlt." }, { status: 400 });
  }

  const { data: machine, error: mErr } = await ctx.service
    .from("machines")
    .select("id, company_id, mandant_id, name, serial_number, status")
    .eq("id", machineId)
    .maybeSingle();

  if (mErr || !machine) {
    return NextResponse.json(
      { error: mErr?.message ?? "Maschine nicht gefunden." },
      { status: mErr ? 500 : 404 },
    );
  }

  const m = machine as {
    id: string;
    company_id: string;
    mandant_id?: string | null;
    name: string | null;
    serial_number: string;
    status: string;
  };

  const machineMandantId =
    (typeof m.mandant_id === "string" && m.mandant_id) ||
    (typeof m.company_id === "string" && m.company_id) ||
    null;

  if (!ctx.isAdmin && actorMandantId && actorMandantId !== machineMandantId) {
    void logEvent(
      "security.mandant_mismatch",
      "Zugriff auf Maschinen-Zusammenfassung verweigert (Mandanten-Mismatch).",
      {
        resource: "machines.refresh_summary",
        machine_id: machineId,
        actor_mandant_id: actorMandantId,
        record_mandant_id: machineMandantId,
      },
      { service: ctx.service, userId: ctx.userId, tenantId: actorMandantId },
    );
    return NextResponse.json({ error: "Kein Zugriff." }, { status: 403 });
  }

  const casesQuery = ctx.service
    .from("ai_cases")
    .select("created_at, analysis_text, solution_steps")
    .eq("machine_id", machineId)
    .eq("company_id", m.company_id)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: recentCases, error: cErr } = await casesQuery;
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const { data: rawLogs, error: lErr } = await ctx.service
    .from("machine_logs")
    .select("created_at, detail, status_after")
    .eq("machine_id", machineId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  let summary: string;
  try {
    summary = await summarizeMachineDashboard({
      machineName: m.name ?? m.serial_number,
      serialNumber: m.serial_number,
      status: m.status,
      recentCases: (recentCases ?? []) as {
        created_at: string | null;
        analysis_text: string | null;
        solution_steps: unknown;
      }[],
      recentLogLines: (rawLogs ?? []) as {
        created_at: string | null;
        detail: string | null;
        status_after: string | null;
      }[],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "KI-Zusammenfassung fehlgeschlagen.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const at = new Date().toISOString();
  const updateRow = {
    last_ai_report: summary,
    last_ai_report_at: at,
  };

  const { error: upErr } = await ctx.service
    .from("machines")
    .update(updateRow)
    .eq("id", machineId);

  if (upErr) {
    return NextResponse.json(
      {
        error:
          upErr.message.includes("last_ai_report") || upErr.code === "PGRST204"
            ? "Spalte last_ai_report fehlt. Bitte Migration 20260328010000 anwenden."
            : upErr.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: SUCCESS_MSG,
    last_ai_report: summary,
    last_ai_report_at: at,
  });
}
