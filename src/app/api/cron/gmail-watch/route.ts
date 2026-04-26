import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createServiceClientFromEnv } from "@/lib/leadmaschineRunner.server";
import { getGmailUserEmail } from "@/lib/gmailClient.server";
import { verifyCronAuth } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
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

async function handle(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const topicName = sanitizeEnv(process.env.GMAIL_PUBSUB_TOPIC);
  if (!topicName) {
    // Pub/Sub ist noch nicht eingerichtet. Cron darf trotzdem "gr\u00fcn" zur\u00fcckliefern,
    // damit Vercel den Job nicht als Fehler markiert.
    return NextResponse.json({ ok: true, skipped: "GMAIL_PUBSUB_TOPIC nicht gesetzt." });
  }

  try {
    const inbox = getGmailUserEmail();
    const gmail = google.gmail({ version: "v1", auth: getGmailAuth() });
    const res = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
        labelFilterAction: "include",
      },
    });

    const historyIdRaw = res.data.historyId != null ? String(res.data.historyId) : "";
    const historyId = historyIdRaw.trim();
    const expirationRaw = res.data.expiration ?? null;

    if (historyId) {
      const service = await createServiceClientFromEnv();
      await service.from("gmail_sync_state").upsert({
        email_address: inbox,
        last_history_id: Number(historyId),
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      inbox,
      topicName,
      historyId: historyId || null,
      expiration: expirationRaw,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gmail watch refresh fehlgeschlagen." },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
