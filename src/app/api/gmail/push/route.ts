import { NextResponse } from "next/server";
import { createServiceClientFromEnv } from "@/lib/leadmaschineRunner.server";
import { getGmailUserEmail, getMessageHeaders } from "@/lib/gmailClient.server";
import { markLeadRepliedFromInbound } from "@/lib/leadReplyDetection.server";
import { google } from "googleapis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

type PubSubGmailPayload = {
  emailAddress?: string;
  historyId?: string | number;
};

type PubSubEnvelope = {
  message?: {
    data?: string;
  };
};

type GmailSyncStateRow = {
  last_history_id?: string | number | null;
};

function decodePubSubMessage(raw: string): PubSubGmailPayload {
  const json = Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json) as PubSubGmailPayload;
}

function getGmailAuth() {
  const clientId = sanitizeEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitizeEnv(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = sanitizeEnv(process.env.GOOGLE_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth fehlt (CLIENT_ID/SECRET/REFRESH_TOKEN).");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function listHistoryMessageIds(input: {
  startHistoryId: string;
}): Promise<string[]> {
  const gmail = google.gmail({ version: "v1", auth: getGmailAuth() });
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 6; i++) {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId: input.startHistoryId,
      historyTypes: ["messageAdded"],
      labelId: "INBOX",
      pageToken,
      maxResults: 200,
    });
    const history = res.data.history ?? [];
    for (const h of history) {
      for (const m of h.messagesAdded ?? []) {
        const mid = m.message?.id;
        if (typeof mid === "string" && mid) ids.push(mid);
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return Array.from(new Set(ids));
}

export async function POST(req: Request) {
  const secret = sanitizeEnv(process.env.AXON_GMAIL_PUSH_SECRET);
  if (secret) {
    const got = (req.headers.get("x-axon-gmail-secret") ?? "").trim();
    if (!got || got !== secret) {
      return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
    }
  }

  let body: PubSubEnvelope;
  try {
    body = (await req.json()) as PubSubEnvelope;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  const dataB64 = body?.message?.data;
  if (typeof dataB64 !== "string" || !dataB64) {
    return NextResponse.json({ error: "Pub/Sub message.data fehlt." }, { status: 400 });
  }

  let decoded: PubSubGmailPayload;
  try {
    decoded = decodePubSubMessage(dataB64);
  } catch {
    return NextResponse.json({ error: "Pub/Sub data konnte nicht dekodiert werden." }, { status: 400 });
  }

  const emailAddress =
    typeof decoded?.emailAddress === "string" ? decoded.emailAddress.trim() : null;
  const historyId =
    decoded?.historyId != null ? String(decoded.historyId).trim() : null;

  if (!emailAddress || !historyId) {
    return NextResponse.json({ error: "emailAddress/historyId fehlt." }, { status: 400 });
  }

  const userId = getGmailUserEmail();
  if (emailAddress.toLowerCase() !== userId.toLowerCase()) {
    // Safety: wir verarbeiten nur die konfigurierte Inbox
    return NextResponse.json({ ok: true, ignored: true });
  }

  const service = await createServiceClientFromEnv();

  // Cursor-State lesen
  const stateRes = await service
    .from("gmail_sync_state")
    .select("last_history_id")
    .eq("email_address", emailAddress)
    .maybeSingle();

  const stateRow = stateRes.data as GmailSyncStateRow | null;
  const rawHistoryId = stateRow?.last_history_id ?? null;
  const lastHistory =
    typeof rawHistoryId === "number"
      ? String(rawHistoryId)
      : typeof rawHistoryId === "string"
        ? rawHistoryId
        : null;

  // Wenn kein Cursor existiert, setzen wir ihn und starten ab dem nächsten Push.
  if (!lastHistory) {
    await service.from("gmail_sync_state").upsert({
      email_address: emailAddress,
      last_history_id: Number(historyId),
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, initialized: true });
  }

  let messageIds: string[] = [];
  try {
    messageIds = await listHistoryMessageIds({
      startHistoryId: lastHistory,
    });
  } catch (e) {
    // Cursor trotzdem vorziehen, um nicht dauerhaft zu hängen – Gmail kann 404 bei zu altem Cursor liefern.
    await service.from("gmail_sync_state").upsert({
      email_address: emailAddress,
      last_history_id: Number(historyId),
      updated_at: new Date().toISOString(),
    });
    return NextResponse.json({
      ok: true,
      warning: e instanceof Error ? e.message : "history.list fehlgeschlagen",
    });
  }

  let matched = 0;
  for (const mid of messageIds.slice(0, 40)) {
    const h = await getMessageHeaders({ userId: "me", messageId: mid });
    const subject = h.subject ?? null;
    const text = h.snippet ?? null;
    const from = h.from ?? null;
    const res = await markLeadRepliedFromInbound({
      service,
      subject,
      text,
      from,
      source: "gmail",
    });
    if (res.ok) matched++;
  }

  await service.from("gmail_sync_state").upsert({
    email_address: emailAddress,
    last_history_id: Number(historyId),
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, processed: messageIds.length, matched });
}

