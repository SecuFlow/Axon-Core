import { Buffer } from "node:buffer";
import { getGmailClient, getGmailUserEmail } from "@/lib/gmailClient.server";
import type { PilotOpsCheck, PilotOpsMonitorResult } from "@/lib/pilotOpsMonitor.server";

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildPlaintextAlertRfc822(input: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const subject = input.subject.replace(/\r?\n/g, " ").trim();
  const body = input.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
    "",
  ].join("\r\n");
}

function formatAlertBody(result: PilotOpsMonitorResult, siteUrl: string): string {
  const lines = [
    `[AXON CORE] Pilot Ops Monitor`,
    `Schweregrad: ${result.severity.toUpperCase()}`,
    `Zeit (UTC): ${new Date().toISOString()}`,
    "",
    "Checks:",
    ...result.checks.map((c: PilotOpsCheck) => `- [${c.level}] ${c.id}: ${c.detail}`),
    "",
    `Fingerprint: ${result.fingerprint}`,
    "",
    `Admin-Dashboard / Leadmaschine prüfen: ${siteUrl}/admin/hq/leadmaschine`,
    "",
    "Hinweis: Bei Gmail-Ausfall hilft OPS_ALERT_WEBHOOK_URL (Slack-kompatibel: {\"text\":\"...\"}).",
  ];
  return lines.join("\n");
}

function resolveAlertRecipients(): string[] {
  const primary =
    (process.env.OPS_ALERT_EMAIL ?? "").trim() ||
    (process.env.AXON_ADMIN_EMAIL ?? "").trim();
  if (!primary) return [];
  return primary
    .split(/[,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

function resolveSiteUrl(): string {
  const v = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL ?? "").trim();
  if (!v) return "https://www.axon-core.de";
  if (v.startsWith("http")) return v.replace(/\/$/, "");
  return `https://${v}`.replace(/\/$/, "");
}

export async function dispatchPilotOpsAlerts(result: PilotOpsMonitorResult): Promise<string[]> {
  const channels: string[] = [];
  const siteUrl = resolveSiteUrl();
  const body = formatAlertBody(result, siteUrl);
  const subject = `[AxonCore Pilot] Ops ${result.severity.toUpperCase()}`;

  const webhookUrl = (process.env.OPS_ALERT_WEBHOOK_URL ?? "").trim();
  if (webhookUrl) {
    try {
      const payload = {
        text: `${subject}\n\n${body}`,
      };
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000),
      });
      if (r.ok) {
        channels.push("webhook");
      } else {
        console.warn("[pilot-ops-alert] webhook HTTP", r.status, await r.text().catch(() => ""));
      }
    } catch (e) {
      console.warn("[pilot-ops-alert] webhook failed:", e instanceof Error ? e.message : e);
    }
  }

  const recipients = resolveAlertRecipients();
  if (recipients.length > 0) {
    try {
      const from = getGmailUserEmail();
      const gmail = getGmailClient();
      for (const to of recipients) {
        const raw = buildPlaintextAlertRfc822({ from, to, subject, body });
        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: base64UrlEncode(raw) },
        });
      }
      channels.push("email");
    } catch (e) {
      console.warn("[pilot-ops-alert] email failed:", e instanceof Error ? e.message : e);
    }
  }

  return channels;
}
