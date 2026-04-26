import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import { generateOutreachMessage } from "@/lib/leadOutreachCopy.server";
import { appendReplyTokenToSubject, generateLeadReplyToken } from "@/lib/leadReplyToken";
import { ensureLeadDemoLink, getPublicSiteUrlFromEnv, getSmbBookingUrlFromEnv } from "@/lib/leadDemoLink.server";
import { LEAD_DAILY_HARD_CAP, sequenceFollowUpDays } from "@/lib/leadmaschineTiming";
import { buildResearchContextForPrompt, fetchLeadResearchNotes } from "@/lib/leadResearch.server";
import { getGmailClient, getGmailUserEmail } from "@/lib/gmailClient.server";

type Settings = {
  enabled: boolean;
  leads_per_month: number;
  max_actions_per_run: number;
  leads_per_month_enterprise: number;
  leads_per_month_smb: number;
  max_actions_per_run_enterprise: number;
  max_actions_per_run_smb: number;
  leads_per_day_enterprise: number;
  leads_per_day_smb: number;
  min_seconds_between_gmail_sends: number;
  auto_send_enabled: boolean;
};

// Generische Postfächer, an die NIE auto-versandt wird (UWG §7: konkreter Entscheider).
// Hardcoded, nicht konfigurierbar. Bei Treffer bleibt die Mail Draft.
const GENERIC_MAILBOX_LOCAL_PARTS = new Set([
  "info",
  "kontakt",
  "contact",
  "office",
  "hello",
  "hi",
  "team",
  "support",
  "service",
  "help",
  "mail",
  "marketing",
  "presse",
  "press",
  "media",
  "pr",
  "vertrieb",
  "sales",
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "webmaster",
  "admin",
  "postmaster",
  "abuse",
]);

function isGenericMailbox(email: string | null | undefined): boolean {
  if (typeof email !== "string") return true;
  const at = email.indexOf("@");
  if (at <= 0) return true;
  const local = email.slice(0, at).trim().toLowerCase();
  return GENERIC_MAILBOX_LOCAL_PARTS.has(local);
}

function isPlausibleEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRfc822Email(input: {
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Inter-Send-Pause innerhalb eines Cron-Runs (Anti-Burst gegen Gmail-API-Rate-Limit).
// Kürzer als settings.min_seconds_between_gmail_sends (das ist für manuellen Send),
// damit der Cron-Run in der Vercel-Default-Timeout-Window bleibt.
const AUTO_SEND_INTER_MAIL_DELAY_MS = 8_000;

type LeadRow = {
  id: string;
  company_name: string;
  domain?: string | null;
  industry?: string | null;
  market_segment?: string | null;
  employee_count?: number | null;
  revenue_eur?: number | null;
  hq_location?: string | null;
  lead_segment?: string | null;
  stage?: string | null;
  next_action_at?: string | null;
  manager_name?: string | null;
  linkedin_url?: string | null;
  corporate_group_name?: string | null;
  location_name?: string | null;
  department?: string | null;
  contact_email?: string | null;
  auto_send_blocked?: boolean | null;
};

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function nowIso() {
  return new Date().toISOString();
}

function daysFromNowIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function getSettings(service: SupabaseClient): Promise<Settings> {
  let res = await service
    .from("leadmaschine_settings")
    .select(
      "enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, leads_per_day_enterprise, leads_per_day_smb, min_seconds_between_gmail_sends, auto_send_enabled, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    res.error &&
    (res.error.message.toLowerCase().includes("column") ||
      res.error.message.toLowerCase().includes("does not exist"))
  ) {
    res = await service
      .from("leadmaschine_settings")
      .select(
        "enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, leads_per_day_enterprise, leads_per_day_smb, min_seconds_between_gmail_sends, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (
    res.error &&
    (res.error.message.toLowerCase().includes("column") ||
      res.error.message.toLowerCase().includes("does not exist"))
  ) {
    res = await service
      .from("leadmaschine_settings")
      .select(
        "enabled, leads_per_month, max_actions_per_run, leads_per_month_enterprise, leads_per_month_smb, max_actions_per_run_enterprise, max_actions_per_run_smb, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (res.error) {
    // Tabelle fehlt oder RLS/Schema noch nicht aktiv: sichere Defaults
    return {
      enabled: true,
      leads_per_month: 150,
      max_actions_per_run: 10,
      leads_per_month_enterprise: 150,
      leads_per_month_smb: 150,
      max_actions_per_run_enterprise: 10,
      max_actions_per_run_smb: 10,
      leads_per_day_enterprise: LEAD_DAILY_HARD_CAP,
      leads_per_day_smb: LEAD_DAILY_HARD_CAP,
      min_seconds_between_gmail_sends: 120,
      auto_send_enabled: false,
    };
  }

  const row = res.data as
    | {
        enabled?: unknown;
        leads_per_month?: unknown;
        max_actions_per_run?: unknown;
        leads_per_month_enterprise?: unknown;
        leads_per_month_smb?: unknown;
        max_actions_per_run_enterprise?: unknown;
        max_actions_per_run_smb?: unknown;
        leads_per_day_enterprise?: unknown;
        leads_per_day_smb?: unknown;
        min_seconds_between_gmail_sends?: unknown;
        auto_send_enabled?: unknown;
      }
    | null;
  const mEnt =
    typeof row?.leads_per_month_enterprise === "number"
      ? row.leads_per_month_enterprise
      : typeof row?.leads_per_month === "number"
        ? row.leads_per_month
        : 150;
  const mSmb = typeof row?.leads_per_month_smb === "number" ? row.leads_per_month_smb : 150;
  return {
    enabled: row?.enabled === false ? false : true,
    leads_per_month:
      typeof row?.leads_per_month === "number" ? row.leads_per_month : 150,
    max_actions_per_run:
      typeof row?.max_actions_per_run === "number"
        ? row.max_actions_per_run
        : 10,
    leads_per_month_enterprise: mEnt,
    leads_per_month_smb: mSmb,
    max_actions_per_run_enterprise:
      typeof row?.max_actions_per_run_enterprise === "number"
        ? row.max_actions_per_run_enterprise
        : typeof row?.max_actions_per_run === "number"
          ? row.max_actions_per_run
          : 10,
    max_actions_per_run_smb:
      typeof row?.max_actions_per_run_smb === "number" ? row.max_actions_per_run_smb : 10,
    // Tages-Cap ist durch LEAD_DAILY_HARD_CAP (Code-Konstante) hart fixiert.
    // DB-Werte werden ignoriert - DSGVO/UWG-Hard-Cap, im Admin-UI nicht editierbar.
    leads_per_day_enterprise: LEAD_DAILY_HARD_CAP,
    leads_per_day_smb: LEAD_DAILY_HARD_CAP,
    min_seconds_between_gmail_sends:
      typeof row?.min_seconds_between_gmail_sends === "number"
        ? row.min_seconds_between_gmail_sends
        : 120,
    auto_send_enabled: row?.auto_send_enabled === true,
  };
}

// Neue Semantik (UWG-konform, manueller Flow):
// Tages- UND Monats-Cap zählen NUR neue Erstkontakte (mail_1_sent).
// Follow-Ups (Tag 3) und Demos (Tag 5) an bereits kontaktierte Leads laufen
// ohne diesen Cap - nur der globale max_actions_per_run_* bleibt als Anti-Burst.
async function countNewContactsLast30d(input: {
  service: SupabaseClient;
  lead_segment: "enterprise" | "smb";
}): Promise<number> {
  const since = daysAgoIso(30);
  const res = await input.service
    .from("lead_outreach_events")
    .select("id, leads!inner(lead_segment)", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("event_type", "mail_1_sent")
    .eq("leads.lead_segment", input.lead_segment);
  return res.count ?? 0;
}

async function countNewContactsLast24h(input: {
  service: SupabaseClient;
  lead_segment: "enterprise" | "smb";
}): Promise<number> {
  const since = daysAgoIso(1);
  const res = await input.service
    .from("lead_outreach_events")
    .select("id, leads!inner(lead_segment)", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("event_type", "mail_1_sent")
    .eq("leads.lead_segment", input.lead_segment);
  return res.count ?? 0;
}

function nextActionForStage(stage: string | null | undefined): "mail_1" | "follow_up" | "demo" | null {
  const s = (stage ?? "new").trim();
  if (s === "new") return "mail_1";
  if (s === "mail_1") return "follow_up";
  if (s === "follow_up") return "demo";
  return null;
}

export async function createServiceClientFromEnv(): Promise<SupabaseClient> {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server nicht konfiguriert (Supabase Service Role).");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function runLeadmaschine(input: {
  service: SupabaseClient;
  actorId: string | null; // null bei Cron
}): Promise<{
  ok: true;
  executed: number;
  skipped_rate_limit: boolean;
  settings: Settings;
  auto_sent: number;
  auto_send_errors: number;
} | { ok: false; error: string }> {
  const { service, actorId } = input;

  const settings = await getSettings(service);
  const maxPerRunEnterprise = clampInt(settings.max_actions_per_run_enterprise, 1, 50);
  const maxPerRunSmb = clampInt(settings.max_actions_per_run_smb, 1, 50);
  const monthlyLimitEnterprise = clampInt(settings.leads_per_month_enterprise, 1, 2000);
  const monthlyLimitSmb = clampInt(settings.leads_per_month_smb, 1, 2000);
  const dailyLimitEnterprise = clampInt(settings.leads_per_day_enterprise, 1, 500);
  const dailyLimitSmb = clampInt(settings.leads_per_day_smb, 1, 500);

  if (!settings.enabled) {
    return {
      ok: true,
      executed: 0,
      skipped_rate_limit: false,
      settings,
      auto_sent: 0,
      auto_send_errors: 0,
    };
  }

  // Rate-Limit: zählen nur noch NEUE Erstkontakte (mail_1_sent).
  // Follow-Ups/Demos laufen ungedeckelt (nur max_actions_per_run_* wirkt).
  const [
    newContactsEnterprise30,
    newContactsSmb30,
    newContactsEnterprise24,
    newContactsSmb24,
  ] = await Promise.all([
    countNewContactsLast30d({ service, lead_segment: "enterprise" }),
    countNewContactsLast30d({ service, lead_segment: "smb" }),
    countNewContactsLast24h({ service, lead_segment: "enterprise" }),
    countNewContactsLast24h({ service, lead_segment: "smb" }),
  ]);
  let remainingNewEnterprise = Math.min(
    Math.max(0, monthlyLimitEnterprise - newContactsEnterprise30),
    Math.max(0, dailyLimitEnterprise - newContactsEnterprise24),
  );
  let remainingNewSmb = Math.min(
    Math.max(0, monthlyLimitSmb - newContactsSmb30),
    Math.max(0, dailyLimitSmb - newContactsSmb24),
  );
  // Es gibt immer mindestens die Möglichkeit, Follow-Ups/Demos zu senden,
  // auch wenn der mail_1-Cap erreicht ist. Daher hier kein globales Skip.

  const NEW_COLUMNS =
    "id, company_name, domain, industry, market_segment, employee_count, revenue_eur, hq_location, lead_segment, stage, next_action_at, manager_name, linkedin_url, corporate_group_name, location_name, department, contact_email, auto_send_blocked";
  const FALLBACK_COLUMNS =
    "id, company_name, domain, industry, market_segment, employee_count, revenue_eur, hq_location, lead_segment, stage, next_action_at, manager_name, linkedin_url, corporate_group_name, location_name, department, contact_email";
  const LEGACY_COLUMNS =
    "id, company_name, domain, industry, market_segment, employee_count, revenue_eur, hq_location, lead_segment, stage, next_action_at";

  let dueRes = await service
    .from("leads")
    .select(NEW_COLUMNS)
    .neq("stage", "disqualified")
    .order("next_action_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (
    dueRes.error &&
    (dueRes.error.message.toLowerCase().includes("column") ||
      dueRes.error.message.toLowerCase().includes("does not exist"))
  ) {
    const fallback = await service
      .from("leads")
      .select(FALLBACK_COLUMNS)
      .neq("stage", "disqualified")
      .order("next_action_at", { ascending: true, nullsFirst: false })
      .limit(200);
    dueRes = fallback as unknown as typeof dueRes;
  }

  if (
    dueRes.error &&
    (dueRes.error.message.toLowerCase().includes("column") ||
      dueRes.error.message.toLowerCase().includes("does not exist"))
  ) {
    const legacy = await service
      .from("leads")
      .select(LEGACY_COLUMNS)
      .neq("stage", "disqualified")
      .order("next_action_at", { ascending: true, nullsFirst: false })
      .limit(200);
    dueRes = legacy as unknown as typeof dueRes;
  }

  if (dueRes.error) {
    return { ok: false, error: dueRes.error.message };
  }

  const now = Date.now();
  const dueUnsorted = (dueRes.data ?? [])
    .map((r) => r as LeadRow)
    .filter((l) => {
      if (!l.next_action_at) return false;
      const t = Date.parse(l.next_action_at);
      return Number.isFinite(t) && t <= now;
    });

  // Research-Priorisierung: Leads mit verwertbaren Hooks/Pain-Points zuerst.
  // Wir capen die Vorab-Research-Fetches, um den Runner nicht unnötig zu verlangsamen.
  const prefetchCap = Math.min(60, dueUnsorted.length);
  const researchByLead = new Map<
    string,
    {
      confidence: number;
      hasHooks: boolean;
      hasPain: boolean;
      hasSummary: boolean;
    }
  >();

  await Promise.all(
    dueUnsorted.slice(0, prefetchCap).map(async (l) => {
      const r = await fetchLeadResearchNotes({ service, leadId: l.id });
      const confidence =
        typeof r?.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : 0;
      const hasHooks =
        typeof r?.personalization_hooks === "string" && r.personalization_hooks.trim().length > 0;
      const hasPain = typeof r?.pain_points === "string" && r.pain_points.trim().length > 0;
      const hasSummary = typeof r?.summary === "string" && r.summary.trim().length > 0;
      researchByLead.set(l.id, { confidence, hasHooks, hasPain, hasSummary });
    }),
  );

  const scoreLead = (lead: LeadRow): number => {
    const r = researchByLead.get(lead.id);
    if (!r) return 0;
    // Gewichtung: Confidence dominiert, Hooks/Pain geben Boost.
    return (
      r.confidence +
      (r.hasHooks ? 25 : 0) +
      (r.hasPain ? 15 : 0) +
      (r.hasSummary ? 10 : 0)
    );
  };

  const due = dueUnsorted.slice().sort((a, b) => {
    const at = Date.parse(a.next_action_at ?? "");
    const bt = Date.parse(b.next_action_at ?? "");
    const aTime = Number.isFinite(at) ? at : 0;
    const bTime = Number.isFinite(bt) ? bt : 0;
    if (aTime !== bTime) return aTime - bTime;
    return scoreLead(b) - scoreLead(a);
  });

  // Anti-Burst-Budget (pro Run, egal ob mail_1/follow_up/demo).
  const budgetGlobal = Math.min(due.length, maxPerRunEnterprise + maxPerRunSmb);
  let executed = 0;
  let executedEnterprise = 0;
  let executedSmb = 0;

  // Auto-Send-Vorbereitung: Gmail-Client einmal pro Run instanziieren.
  // Wenn Auto-Send aktiv, aber Gmail-Setup fehlt: Auto-Send wird stillschweigend
  // deaktiviert, Drafts entstehen weiterhin (wie bisher).
  const autoSendRequested = settings.auto_send_enabled === true;
  let gmailClient: ReturnType<typeof getGmailClient> | null = null;
  let gmailFrom: string | null = null;
  if (autoSendRequested) {
    try {
      gmailClient = getGmailClient();
      gmailFrom = getGmailUserEmail();
    } catch {
      gmailClient = null;
      gmailFrom = null;
    }
  }
  const autoSendActive = autoSendRequested && gmailClient !== null && gmailFrom !== null;
  let autoSentInThisRun = 0;
  let autoSendErrors = 0;

  for (const lead of due) {
    if (executed >= budgetGlobal) break;
    const kind = nextActionForStage(lead.stage);
    if (!kind) continue;

    const seg = lead.lead_segment === "smb" ? "smb" : "enterprise";
    // Anti-Burst-Cap pro Run (harter Stopp, egal welche Stufe).
    if (seg === "enterprise" && executedEnterprise >= maxPerRunEnterprise) continue;
    if (seg === "smb" && executedSmb >= maxPerRunSmb) continue;

    // Nur für Erstkontakt (mail_1) gilt der Tages-/Monats-Cap "Neue Kontakte".
    if (kind === "mail_1") {
      if (seg === "enterprise" && remainingNewEnterprise <= 0) continue;
      if (seg === "smb" && remainingNewSmb <= 0) continue;
    }
    const research = await fetchLeadResearchNotes({ service, leadId: lead.id });
    const research_context = buildResearchContextForPrompt(research);
    const msg = await generateOutreachMessage({
      kind,
      lead: {
        company_name: lead.company_name,
        domain: typeof lead.domain === "string" ? lead.domain : null,
        industry: typeof lead.industry === "string" ? lead.industry : null,
        market_segment: typeof lead.market_segment === "string" ? lead.market_segment : null,
        employee_count: typeof lead.employee_count === "number" ? lead.employee_count : null,
        revenue_eur: typeof lead.revenue_eur === "number" ? lead.revenue_eur : null,
        hq_location: typeof lead.hq_location === "string" ? lead.hq_location : null,
        lead_segment: seg,
        research_context,
        manager_name: typeof lead.manager_name === "string" ? lead.manager_name : null,
        linkedin_url: typeof lead.linkedin_url === "string" ? lead.linkedin_url : null,
        corporate_group_name:
          typeof lead.corporate_group_name === "string" ? lead.corporate_group_name : null,
        location_name: typeof lead.location_name === "string" ? lead.location_name : null,
        department: typeof lead.department === "string" ? lead.department : null,
      },
    });

    let demoLink: string | null = null;
    if (kind === "demo" && seg === "enterprise") {
      try {
        const ensured = await ensureLeadDemoLink({
          service,
          leadId: lead.id,
          actorId,
        });
        const base = getPublicSiteUrlFromEnv();
        demoLink = base
          ? `${base}/api/public/demo-link/${encodeURIComponent(ensured.token)}`
          : ensured.url;
      } catch {
        demoLink = null;
      }
    }

    const replyToken = generateLeadReplyToken();
    const subject = appendReplyTokenToSubject(msg.subject, replyToken);

    const bookingUrl = kind === "demo" && seg === "smb" ? getSmbBookingUrlFromEnv() : null;
    const body =
      kind === "demo" && seg === "enterprise" && demoLink
        ? `${msg.body}\n\nDemo‑Link: ${demoLink}`
        : kind === "demo" && seg === "smb" && bookingUrl
          ? `${msg.body}\n\nBeratungsgespräch buchen: ${bookingUrl}`
          : msg.body;

    const insertMsg = await service
      .from("lead_messages")
      .insert({
        lead_id: lead.id,
        message_type: kind,
        reply_token: replyToken,
        subject,
        body,
        metadata: { model: msg.model, actor: actorId, demo_link: demoLink },
      })
      .select("id")
      .single();

    if (insertMsg.error) {
      const e = insertMsg.error as PostgrestError;
      return { ok: false, error: e.message };
    }

    const stage = kind === "mail_1" ? "mail_1" : kind === "follow_up" ? "follow_up" : "demo_sent";
    const delays = sequenceFollowUpDays(seg);
    const next_action_at =
      kind === "mail_1"
        ? daysFromNowIso(delays.afterMail1)
        : kind === "follow_up"
          ? daysFromNowIso(delays.afterFollowUp)
          : null;

    const upd = await service
      .from("leads")
      .update({
        stage,
        last_contacted_at: nowIso(),
        next_action_at,
      })
      .eq("id", lead.id);

    if (upd.error) return { ok: false, error: upd.error.message };

    const evt = await service
      .from("lead_outreach_events")
      .insert({
        lead_id: lead.id,
        event_type: `${kind}_sent`,
        channel: "email",
        status: "prepared",
        metadata: { message_id: insertMsg.data?.id ?? null, actor: actorId, runner: true },
      })
      .select("id")
      .single();
    if (evt.error) return { ok: false, error: evt.error.message };
    const eventId = (evt.data as { id?: string } | null)?.id ?? null;

    // Auto-Send: nur wenn Master-Switch aktiv UND Lead nicht pro Lead geblockt
    // UND Empfänger plausibel UND keine generische Mailbox (info@/kontakt@/...).
    // Bei jedem fehlgeschlagenen Guard bleibt die Mail Draft (wie bisher).
    const recipient = typeof lead.contact_email === "string" ? lead.contact_email.trim() : "";
    const blockedPerLead = lead.auto_send_blocked === true;
    const recipientOk = isPlausibleEmail(recipient) && !isGenericMailbox(recipient);

    if (autoSendActive && !blockedPerLead && recipientOk && gmailClient && gmailFrom) {
      try {
        if (autoSentInThisRun > 0) {
          await sleep(AUTO_SEND_INTER_MAIL_DELAY_MS);
        }
        const raw = buildRfc822Email({
          from: gmailFrom,
          to: recipient,
          subject,
          body,
        });
        const send = await gmailClient.users.messages.send({
          userId: "me",
          requestBody: { raw: base64UrlEncode(raw) },
        });
        const gmailMessageId =
          typeof send.data.id === "string" ? send.data.id : null;
        const gmailThreadId =
          typeof send.data.threadId === "string" ? send.data.threadId : null;
        const sentAt = nowIso();

        await service
          .from("lead_messages")
          .update({
            sent_at: sentAt,
            gmail_message_id: gmailMessageId,
            gmail_thread_id: gmailThreadId,
            to_email: recipient,
          })
          .eq("id", insertMsg.data?.id ?? "");

        if (eventId) {
          await service
            .from("lead_outreach_events")
            .update({
              status: "sent",
              metadata: {
                message_id: insertMsg.data?.id ?? null,
                actor: actorId,
                runner: true,
                auto_send: true,
                gmail_message_id: gmailMessageId,
                gmail_thread_id: gmailThreadId,
                sent_at: sentAt,
              },
            })
            .eq("id", eventId);
        }

        await service
          .from("leads")
          .update({ last_contacted_at: sentAt })
          .eq("id", lead.id);

        autoSentInThisRun += 1;
      } catch (err) {
        autoSendErrors += 1;
        const errMsg = err instanceof Error ? err.message : "Auto-Send fehlgeschlagen.";
        if (eventId) {
          await service
            .from("lead_outreach_events")
            .update({
              metadata: {
                message_id: insertMsg.data?.id ?? null,
                actor: actorId,
                runner: true,
                auto_send: true,
                auto_send_error: errMsg,
              },
            })
            .eq("id", eventId);
        }
        // Mail bleibt Draft (status weiterhin 'prepared'), kein Run-Abbruch.
      }
    }

    executed++;
    if (seg === "enterprise") {
      executedEnterprise++;
      if (kind === "mail_1") {
        remainingNewEnterprise = Math.max(0, remainingNewEnterprise - 1);
      }
    } else {
      executedSmb++;
      if (kind === "mail_1") {
        remainingNewSmb = Math.max(0, remainingNewSmb - 1);
      }
    }
  }

  // skipped_rate_limit = true nur, wenn NICHTS ausgeführt wurde UND beide
  // "Neue Kontakte"-Caps komplett erschöpft waren und keine Follow-Ups/Demos dran waren.
  const skipped_rate_limit =
    executed === 0 &&
    remainingNewEnterprise <= 0 &&
    remainingNewSmb <= 0 &&
    due.length > 0;

  return {
    ok: true,
    executed,
    skipped_rate_limit,
    settings,
    auto_sent: autoSentInThisRun,
    auto_send_errors: autoSendErrors,
  };
}

