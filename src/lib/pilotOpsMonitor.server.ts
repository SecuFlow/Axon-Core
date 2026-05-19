import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/auditLog";
import { probeGmailRefreshToken } from "@/lib/gmailOAuthProbe.server";
import { fetchLeadOutreachSendStats24h } from "@/lib/leadOutreachEventStats.server";

export type OpsCheckLevel = "ok" | "warning" | "critical";

export type PilotOpsCheck = {
  id: string;
  level: OpsCheckLevel;
  detail: string;
};

export type PilotOpsMonitorResult = {
  severity: OpsCheckLevel;
  checks: PilotOpsCheck[];
  fingerprint: string;
};

function envTruthy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function worstLevel(a: OpsCheckLevel, b: OpsCheckLevel): OpsCheckLevel {
  const rank: Record<OpsCheckLevel, number> = { ok: 0, warning: 1, critical: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function stripeSecretMode(secret: string): "live" | "test" | "unset" {
  const k = secret.trim();
  if (!k) return "unset";
  if (k.startsWith("sk_live_")) return "live";
  return "test";
}

export async function runPilotOpsMonitor(service: SupabaseClient): Promise<PilotOpsMonitorResult> {
  const checks: PilotOpsCheck[] = [];

  let enabled = false;
  let autoSendEnabled = false;
  const settingsRes = await service
    .from("leadmaschine_settings")
    .select("enabled, auto_send_enabled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (settingsRes.error) {
    const msg = settingsRes.error.message ?? "";
    if (msg.toLowerCase().includes("relation") || msg.includes("does not exist")) {
      checks.push({
        id: "leadmaschine_settings",
        level: "critical",
        detail: `leadmaschine_settings nicht lesbar: ${msg.slice(0, 200)}`,
      });
    } else {
      checks.push({
        id: "leadmaschine_settings",
        level: "warning",
        detail: `Settings-Abfrage mit Warnung: ${msg.slice(0, 200)}`,
      });
    }
  } else {
    const row = settingsRes.data as {
      enabled?: unknown;
      auto_send_enabled?: unknown;
    } | null;
    enabled = row?.enabled === true;
    autoSendEnabled = row?.auto_send_enabled === true;
    checks.push({
      id: "leadmaschine_master_switch",
      level: "ok",
      detail: enabled ? "Leadmaschine ist aktiviert." : "Leadmaschine ist deaktiviert (Cron läuft, verschickt ggf. nichts).",
    });
    checks.push({
      id: "leadmaschine_auto_send",
      level: "ok",
      detail: autoSendEnabled
        ? "Auto-Send ist an."
        : "Auto-Send ist aus (nur manuelle / Draft-Schritte).",
    });
  }

  let outreachStats: Awaited<ReturnType<typeof fetchLeadOutreachSendStats24h>> | null = null;
  try {
    outreachStats = await fetchLeadOutreachSendStats24h(service);
  } catch {
    checks.push({
      id: "outreach_stats",
      level: "warning",
      detail: "Konnte lead_outreach_events nicht auswerten.",
    });
  }

  const gmail = await probeGmailRefreshToken();
  if (gmail.ok) {
    checks.push({
      id: "gmail_oauth",
      level: "ok",
      detail: "Gmail-OAuth (Refresh) OK.",
    });
  } else {
    const level: OpsCheckLevel =
      enabled && autoSendEnabled ? "critical" : enabled ? "warning" : "warning";
    checks.push({
      id: "gmail_oauth",
      level,
      detail: `Gmail-OAuth: ${gmail.code} — ${gmail.message}`,
    });
  }

  if (outreachStats) {
    const warnThreshold = Number(process.env.OPS_ALERT_AUTO_SEND_ERRORS_WARN ?? "8");
    const thr = Number.isFinite(warnThreshold) ? Math.max(3, warnThreshold) : 8;
    if (outreachStats.recent_invalid_grant_24h > 0) {
      checks.push({
        id: "recent_invalid_grant",
        level: enabled && autoSendEnabled ? "critical" : "warning",
        detail: `Letzte 24h: ${outreachStats.recent_invalid_grant_24h}× invalid_grant (Auto-Send).`,
      });
    } else if (outreachStats.recent_auto_send_errors_24h >= thr) {
      checks.push({
        id: "recent_auto_send_errors",
        level: "warning",
        detail: `Letzte 24h: ${outreachStats.recent_auto_send_errors_24h} Auto-Send-Fehler (Schwellenwert ${thr}).`,
      });
    } else {
      checks.push({
        id: "recent_auto_send_errors",
        level: "ok",
        detail: `Letzte 24h: ${outreachStats.recent_auto_send_errors_24h} Auto-Send-Fehler; invalid_grant: ${outreachStats.recent_invalid_grant_24h}.`,
      });
    }
    checks.push({
      id: "last_auto_send_success",
      level: "ok",
      detail: outreachStats.last_successful_auto_send_at
        ? `Letzter erfolgreicher Versand: ${outreachStats.last_successful_auto_send_at}`
        : "Noch kein erfolgreicher Versand (sent) in lead_outreach_events geloggt.",
    });
  }

  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim();
  if (vercelEnv === "production") {
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
    if (stripeSecretMode(stripeKey) === "test") {
      checks.push({
        id: "stripe_mode",
        level: "warning",
        detail: "Production läuft mit Stripe-TEST-Key (sk_test_). Live-Zahlungen gehen so nicht.",
      });
    }
    const cronOk =
      Boolean((process.env.CRON_SECRET ?? "").trim()) ||
      Boolean((process.env.AXON_CRON_SECRET ?? "").trim());
    if (!cronOk) {
      checks.push({
        id: "cron_secret",
        level: "warning",
        detail: "Production ohne CRON_SECRET / AXON_CRON_SECRET — Cron-Endpunkte sind öffentlich zugänglich.",
      });
    }
  }

  let severity: OpsCheckLevel = "ok";
  for (const c of checks) {
    severity = worstLevel(severity, c.level);
  }

  const alarming = checks.filter((c) => c.level !== "ok");
  const fingerprint = createHash("sha256")
    .update(
      alarming
        .filter((c) => c.level === "critical" || c.level === "warning")
        .map((c) => `${c.id}:${c.level}:${c.detail}`)
        .sort()
        .join("|"),
    )
    .digest("hex");

  return { severity, checks, fingerprint };
}

export async function shouldThrottlePilotOpsAlert(input: {
  service: SupabaseClient;
  fingerprint: string;
  cooldownMinutes: number;
}): Promise<boolean> {
  const { service, fingerprint, cooldownMinutes } = input;
  if (!fingerprint) return false;
  const mins = Math.max(15, Math.min(24 * 60, cooldownMinutes));
  const since = new Date(Date.now() - mins * 60 * 1000).toISOString();
  const res = await service
    .from("audit_logs")
    .select("metadata, created_at")
    .eq("action", "pilot_ops_alert")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(40);

  if (res.error) return false;

  for (const row of res.data ?? []) {
    const meta = (row as { metadata?: unknown }).metadata as { fingerprint?: unknown } | null;
    if (meta && typeof meta.fingerprint === "string" && meta.fingerprint === fingerprint) {
      return true;
    }
  }
  return false;
}

export async function recordPilotOpsAlertSent(input: {
  service: SupabaseClient;
  fingerprint: string;
  severity: OpsCheckLevel;
  channels: string[];
}): Promise<void> {
  await logEvent(
    "pilot_ops_alert",
    `Pilot Ops Alert (${input.severity})`,
    {
      fingerprint: input.fingerprint,
      severity: input.severity,
      channels: input.channels,
      sent_at: new Date().toISOString(),
    },
    { service: input.service, userId: null, companyId: null, tenantId: null },
  );
}
