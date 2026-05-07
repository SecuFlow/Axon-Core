import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { runPilotOpsMonitor } from "@/lib/pilotOpsMonitor.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

/**
 * Gleiche Checks wie `/api/cron/ops-monitor`, aber **ohne** Webhook/Mail-Versand
 * (nur Anzeige im Admin-UI).
 */
export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
  }

  try {
    const monitor = await runPilotOpsMonitor(ctx.service);
    return NextResponse.json(
      {
        ...monitor,
        generated_at: new Date().toISOString(),
        source: "admin_ui",
        hint:
          "Automatische Alerts laufen über Vercel Cron `/api/cron/ops-monitor` (täglich 08:00 UTC). Hier nur Live-Ansicht.",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message, hint: "Supabase Service Role / Env prüfen." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
