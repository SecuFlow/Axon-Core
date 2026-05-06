#!/usr/bin/env node
// Recovery: Versendet lead_messages, die durch das vorherige `invalid_grant`-
// Problem als Draft (sent_at IS NULL) liegen geblieben sind.
//
// Findet alle lead_messages mit:
//   - sent_at IS NULL
//   - created_at > now() - 24h
//   - dem zugehoerigen lead_outreach_events-Eintrag mit
//     metadata->>'auto_send_error' LIKE '%invalid_grant%'
//
// Sendet jede Mail mit Mindest-Pause (Default 30s) ueber Gmail, updatet
// lead_messages.sent_at + gmail_message_id, schreibt einen neuen
// lead_outreach_events-Eintrag mit status='sent' und stempelt
// leads.last_contacted_at neu.
//
// One-shot. Keine Wiederausfuehrung noetig sobald alle Drafts verschickt.
//
// Aufruf:
//   node scripts/recover-stuck-mail-drafts.mjs           # default 30s Pause
//   node scripts/recover-stuck-mail-drafts.mjs --gap=10  # 10s Pause
//   node scripts/recover-stuck-mail-drafts.mjs --dry     # nur listen, nicht senden

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const gapArg = args.find((a) => a.startsWith("--gap="));
const gapSeconds = Math.max(
  5,
  Math.min(600, gapArg ? Number(gapArg.split("=")[1]) || 30 : 30),
);

const sanitize = (v) => (typeof v === "string" ? v.replace(/\s/g, "") : v);

// Production-DB bevorzugen, sonst Local. Beides liegt in .env.local; die
// Production-URL endet auf supabase.co, die lokale auf 127.0.0.1.
function pickServiceClient() {
  const lines = readFileSync(resolve(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  let prodUrl = null;
  let prodKey = null;
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = sanitize(line.slice(eq + 1).trim());
    if (key === "NEXT_PUBLIC_SUPABASE_URL" && value.includes("supabase.co")) {
      prodUrl = value;
    }
    if (
      key === "SUPABASE_SERVICE_ROLE_KEY" &&
      value &&
      value.startsWith("eyJ")
    ) {
      prodKey = value;
    }
  }

  if (!prodUrl || !prodKey) {
    throw new Error(
      "Konnte Production-Supabase-URL + Service-Key in .env.local nicht eindeutig finden.",
    );
  }
  return createClient(prodUrl, prodKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getGmailClient() {
  const clientId = sanitize(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitize(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = sanitize(process.env.GOOGLE_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN fehlt.",
    );
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

function getGmailFrom() {
  const v = sanitize(process.env.GMAIL_USER_EMAIL);
  if (!v) throw new Error("GMAIL_USER_EMAIL fehlt.");
  return v;
}

function base64UrlEncode(input) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildRfc822Email({ from, to, subject, body }) {
  const cleanSubject = subject.replace(/\r?\n/g, " ").trim();
  const cleanBody = body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${cleanSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    cleanBody,
    "",
  ].join("\r\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const service = pickServiceClient();
  const gmail = getGmailClient();
  const from = getGmailFrom();

  console.log(`[recovery] starte. dry=${dryRun} gap=${gapSeconds}s from=${from}`);

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: messages, error } = await service
    .from("lead_messages")
    .select(
      "id, lead_id, subject, body, message_type, created_at, sent_at, leads!inner(id, contact_email, company_name, last_contacted_at)",
    )
    .is("sent_at", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[recovery] Fehler beim Laden:", error.message);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log("[recovery] Keine offenen Drafts gefunden.");
    return;
  }

  // Filter: nur die, fuer die in den letzten 24h ein invalid_grant-Event
  // existiert. Verhindert dass wir versehentlich legit Drafts versenden,
  // die ein Mensch absichtlich zurueckgehalten hat.
  const eligibleIds = [];
  for (const m of messages) {
    const evRes = await service
      .from("lead_outreach_events")
      .select("metadata, created_at")
      .eq("lead_id", m.lead_id)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5);
    if (evRes.error) continue;
    const hasInvalidGrant = (evRes.data ?? []).some((row) => {
      const md = row?.metadata;
      const err = md && typeof md === "object" ? md.auto_send_error : null;
      return typeof err === "string" && /invalid_grant/i.test(err);
    });
    if (hasInvalidGrant) eligibleIds.push(m.id);
  }

  const queue = messages.filter((m) => eligibleIds.includes(m.id));
  console.log(
    `[recovery] gefunden: ${messages.length} Drafts, eligible (invalid_grant in den letzten 24h): ${queue.length}`,
  );

  for (const [idx, m] of queue.entries()) {
    const lead = m.leads;
    const to =
      typeof lead?.contact_email === "string" ? lead.contact_email.trim() : "";
    const company = lead?.company_name ?? "?";
    const subject =
      typeof m.subject === "string" && m.subject.trim()
        ? m.subject.trim()
        : `Kontakt: ${company}`;

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      console.warn(
        `[recovery] [${idx + 1}/${queue.length}] SKIP ${company}: Empfaenger ungueltig (${to})`,
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `[recovery] [${idx + 1}/${queue.length}] DRY ${company} -> ${to} | "${subject}"`,
      );
      continue;
    }

    if (idx > 0) {
      console.log(`[recovery]   warte ${gapSeconds}s ...`);
      await sleep(gapSeconds * 1000);
    }

    try {
      const raw = buildRfc822Email({ from, to, subject, body: m.body });
      const send = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: base64UrlEncode(raw) },
      });
      const gmailMessageId =
        typeof send.data.id === "string" ? send.data.id : null;
      const gmailThreadId =
        typeof send.data.threadId === "string" ? send.data.threadId : null;
      const sentAt = new Date().toISOString();

      await service
        .from("lead_messages")
        .update({
          sent_at: sentAt,
          gmail_message_id: gmailMessageId,
          gmail_thread_id: gmailThreadId,
          to_email: to,
        })
        .eq("id", m.id);

      await service.from("lead_outreach_events").insert({
        lead_id: m.lead_id,
        event_type: `${m.message_type ?? "mail_1"}_sent`,
        channel: "email",
        status: "sent",
        metadata: {
          actor: null,
          message_id: m.id,
          gmail_message_id: gmailMessageId,
          gmail_thread_id: gmailThreadId,
          recovery: true,
          recovery_reason: "invalid_grant_replay",
          sent_at: sentAt,
        },
      });

      await service
        .from("leads")
        .update({ last_contacted_at: sentAt })
        .eq("id", m.lead_id);

      console.log(
        `[recovery] [${idx + 1}/${queue.length}] OK  ${company} -> ${to} (gmail_id=${gmailMessageId})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[recovery] [${idx + 1}/${queue.length}] ERR ${company} -> ${to}: ${msg}`,
      );
    }
  }

  console.log("[recovery] fertig.");
}

main().catch((e) => {
  console.error("[recovery] FATAL:", e?.message ?? e);
  process.exit(1);
});
