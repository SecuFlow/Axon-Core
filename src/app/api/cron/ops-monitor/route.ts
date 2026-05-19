import { NextResponse } from "next/server";
import { createServiceClientFromEnv } from "@/lib/leadmaschineRunner.server";
import { verifyCronAuth } from "@/lib/cronAuth";
import {
  recordPilotOpsAlertSent,
  runPilotOpsMonitor,
  shouldThrottlePilotOpsAlert,
} from "@/lib/pilotOpsMonitor.server";
import { dispatchPilotOpsAlerts } from "@/lib/pilotOpsAlerts.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envTruthy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const service = await createServiceClientFromEnv();
    const monitor = await runPilotOpsMonitor(service);

    const includeWarnings = envTruthy(process.env.OPS_ALERT_INCLUDE_WARNINGS);
    const needsAlert =
      monitor.severity === "critical" ||
      (monitor.severity === "warning" && includeWarnings);

    if (!needsAlert) {
      return NextResponse.json({
        ok: true,
        alerted: false,
        reason: "severity_ok_or_warnings_suppressed",
        severity: monitor.severity,
        checks: monitor.checks,
        fingerprint: monitor.fingerprint,
      });
    }

    const cooldownRaw = Number(process.env.OPS_ALERT_COOLDOWN_MINUTES ?? "180");
    const cooldownMinutes = Number.isFinite(cooldownRaw) ? cooldownRaw : 180;

    const throttled = await shouldThrottlePilotOpsAlert({
      service,
      fingerprint: monitor.fingerprint,
      cooldownMinutes,
    });

    if (throttled) {
      return NextResponse.json({
        ok: true,
        alerted: false,
        throttled: true,
        cooldown_minutes: cooldownMinutes,
        severity: monitor.severity,
        checks: monitor.checks,
        fingerprint: monitor.fingerprint,
      });
    }

    const channels = await dispatchPilotOpsAlerts(monitor);

    if (channels.length > 0) {
      await recordPilotOpsAlertSent({
        service,
        fingerprint: monitor.fingerprint,
        severity: monitor.severity,
        channels,
      });
    }

    return NextResponse.json({
      ok: true,
      alerted: channels.length > 0,
      channels,
      severity: monitor.severity,
      checks: monitor.checks,
      fingerprint: monitor.fingerprint,
      hint:
        channels.length === 0
          ? "Kein Versand: OPS_ALERT_WEBHOOK_URL setzen und/oder OPS_ALERT_EMAIL oder AXON_ADMIN_EMAIL."
          : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/ops-monitor]", message);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: "Typisch: SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL fehlen.",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
