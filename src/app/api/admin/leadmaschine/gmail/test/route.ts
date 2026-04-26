import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { google } from "googleapis";
import { getGmailClient, getGmailUserEmail, getMessageHeaders } from "@/lib/gmailClient.server";
import { extractReplyTokenFromText } from "@/lib/leadReplyToken";

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

async function listHistoryMessageIds(input: {
  startHistoryId: string;
}): Promise<string[]> {
  const gmail = google.gmail({ version: "v1", auth: getGmailAuth() });
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 4; i++) {
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

/**
 * Gmail-Test: zuerst OAuth + Profil (immer).
 * Optional: Wenn ein Watch-Cursor existiert, zusätzlich History-Dry-Run (Token-Matching).
 */
export async function POST() {
  try {
    const ctx = await requireAdminMutationContext();
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status, headers: NO_STORE_HEADERS });
    }

    const gmail = getGmailClient();
    let profileEmail: string | null = null;
    let messagesTotal: number | null = null;
    try {
      const prof = await gmail.users.getProfile({ userId: "me" });
      profileEmail = typeof prof.data.emailAddress === "string" ? prof.data.emailAddress : null;
      messagesTotal =
        typeof prof.data.messagesTotal === "number" ? prof.data.messagesTotal : null;
    } catch (e) {
      return NextResponse.json(
        {
          error:
            e instanceof Error
              ? e.message
              : "Gmail-Profil konnte nicht gelesen werden (OAuth prüfen).",
        },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }

    const envInbox = getGmailUserEmail();
    if (profileEmail && envInbox.toLowerCase() !== profileEmail.toLowerCase()) {
      return NextResponse.json(
        {
          ok: false,
          error: `GMAIL_USER_EMAIL (${envInbox}) weicht von OAuth-Konto (${profileEmail}) ab.`,
          profile_email: profileEmail,
          env_inbox: envInbox,
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    const inbox = envInbox;
    const stateRes = await ctx.service
      .from("gmail_sync_state")
      .select("last_history_id")
      .eq("email_address", inbox)
      .maybeSingle();

    const stateRow = stateRes.data as { last_history_id?: unknown } | null;
    const lastHistory =
      typeof stateRow?.last_history_id === "number"
        ? String(stateRow.last_history_id)
        : typeof stateRow?.last_history_id === "string"
          ? stateRow.last_history_id
          : null;

    if (!lastHistory) {
      return NextResponse.json(
        {
          ok: true,
          phase: "oauth_only",
          inbox,
          profile_email: profileEmail,
          messages_total: messagesTotal,
          history_dry_run: null,
          note:
            "OAuth und Postfach-Zugriff sind in Ordnung. Für History-/Reply-Tests bitte einmal „Gmail Watch“ ausführen (setzt historyId-Cursor).",
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    let messageIds: string[] = [];
    try {
      messageIds = await listHistoryMessageIds({ startHistoryId: lastHistory });
    } catch (e) {
      return NextResponse.json(
        {
          ok: true,
          phase: "oauth_ok_history_failed",
          inbox,
          profile_email: profileEmail,
          messages_total: messagesTotal,
          start_history_id: lastHistory,
          history_error: e instanceof Error ? e.message : "history.list fehlgeschlagen",
          note:
            "OAuth OK, aber Gmail History konnte nicht gelesen werden (Cursor evtl. zu alt — erneut „Gmail Watch“).",
        },
        { headers: NO_STORE_HEADERS },
      );
    }

    let tokensFound = 0;
    let tokensMatched = 0;

    for (const mid of messageIds.slice(0, 25)) {
      const h = await getMessageHeaders({ userId: "me", messageId: mid });
      const subject = h.subject ?? "";
      const snippet = h.snippet ?? "";
      const token =
        extractReplyTokenFromText(subject) ?? extractReplyTokenFromText(snippet);
      if (!token) continue;
      tokensFound++;
      const match = await ctx.service
        .from("lead_messages")
        .select("id")
        .eq("reply_token", token)
        .limit(1)
        .maybeSingle();
      if (match.data?.id) tokensMatched++;
    }

    return NextResponse.json(
      {
        ok: true,
        phase: "full",
        inbox,
        profile_email: profileEmail,
        messages_total: messagesTotal,
        start_history_id: lastHistory,
        inbox_messages_added: messageIds.length,
        tokens_found: tokensFound,
        tokens_matched: tokensMatched,
        note:
          "Dry‑Run: keine Updates an Leads. Für echte Verarbeitung nutzt Pub/Sub Push → /api/gmail/push.",
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Gmail-Test konnte nicht ausgeführt werden.",
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
