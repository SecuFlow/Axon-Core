import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { google } from "googleapis";
import { getGmailUserEmail } from "@/lib/gmailClient.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

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

export async function POST() {
  try {
    const ctx = await requireAdminMutationContext();
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
    }

    const topicName = sanitizeEnv(process.env.GMAIL_PUBSUB_TOPIC);
    if (!topicName) {
      return NextResponse.json(
        {
          error:
            "GMAIL_PUBSUB_TOPIC fehlt (Format: projects/<project-id>/topics/<topic>).",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

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

    // Gmail liefert eine historyId zurück. Wir speichern sie als Cursor, damit
    // der nächste Push sauber ab dort verarbeitet wird.
    const historyIdRaw = res.data.historyId != null ? String(res.data.historyId) : "";
    const historyId = historyIdRaw.trim();
    if (historyId) {
      await ctx.service.from("gmail_sync_state").upsert({
        email_address: inbox,
        last_history_id: Number(historyId),
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        inbox,
        topicName,
        historyId: historyId || null,
        expiration: res.data.expiration ?? null,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gmail watch fehlgeschlagen." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

