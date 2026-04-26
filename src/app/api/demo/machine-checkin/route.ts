import { NextResponse } from "next/server";
import { resolveDemoGuestContextFromRequest } from "@/lib/demoGuestContext.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Platzhalter-UUID für `machine_logs.user_id` (kein Login im Demo-Gastmodus). */
const DEMO_WORKER_USER_ID = "00000000-0000-4000-8000-000000000001";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

/**
 * Demo: Check-In an einer Maschine simulieren — erscheint im Konzern-Dashboard unter den Maschinen-Logs.
 * POST JSON `{ machine_id: string }`, Query `?demo=<slug>` (wie andere Demo-APIs).
 */
export async function POST(request: Request) {
  const demoCtx = await resolveDemoGuestContextFromRequest(request);
  if (!demoCtx.ok) {
    return NextResponse.json({ error: demoCtx.error }, { status: demoCtx.status });
  }

  let body: { machine_id?: unknown };
  try {
    body = (await request.json()) as { machine_id?: unknown };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const machineId = typeof body.machine_id === "string" ? body.machine_id.trim() : "";
  if (!machineId) {
    return NextResponse.json({ error: "machine_id fehlt." }, { status: 400 });
  }

  const { service, companyId } = demoCtx;

  const { data: machine, error: mErr } = await service
    .from("machines")
    .select("id, name, serial_number, company_id")
    .eq("id", machineId)
    .maybeSingle();

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  const m = machine as { id?: string; company_id?: string } | null;
  if (!m?.id || m.company_id !== companyId) {
    return NextResponse.json({ error: "Maschine nicht gefunden." }, { status: 404 });
  }

  const label =
    typeof (machine as { name?: string | null }).name === "string" &&
    (machine as { name: string }).name.trim()
      ? (machine as { name: string }).name.trim()
      : String((machine as { serial_number?: string }).serial_number ?? "Maschine");

  const { data: inserted, error: insErr } = await service
    .from("machine_logs")
    .insert({
      machine_id: machineId,
      user_id: DEMO_WORKER_USER_ID,
      action: "Check-In bestätigt",
      detail: `Demo-User · ${label}`,
      ai_case_id: null,
    })
    .select("id, created_at")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    log_id: (inserted as { id: string }).id,
    created_at: (inserted as { created_at?: string }).created_at ?? null,
  });
}

/** GET nur für schnelle Prüfung / Doku */
export async function GET() {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "Server nicht konfiguriert." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    hint: "POST mit ?demo=<slug> und JSON { machine_id }",
  });
}
