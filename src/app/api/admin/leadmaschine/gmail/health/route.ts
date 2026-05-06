import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

type HealthClass =
  | "ok"
  | "missing_env"
  | "invalid_grant"
  | "unknown_oauth_error";

type Health = {
  status: HealthClass;
  oauth_ok: boolean;
  /** Roh-Fehlertext von Google, gekuerzt. */
  oauth_error: string | null;
  /** Anzahl `auto_send_error: invalid_grant` in lead_outreach_events der letzten 24h. */
  recent_invalid_grant_24h: number;
  /** Anzahl beliebiger `auto_send_error` in den letzten 24h. */
  recent_auto_send_errors_24h: number;
  /** Letzter erfolgreicher Auto-Send (status='sent'), ISO. */
  last_successful_auto_send_at: string | null;
  /** Mensch-lesbarer Hinweis, was zu tun ist. */
  hint: string;
  /** Doku-Link zur Token-Erneuerung. */
  docs_url: string;
};

const DOCS_URL = "/docs/leadmaschine-gmail-setup.md";

/**
 * Gibt zurueck, ob das `GOOGLE_REFRESH_TOKEN` aktuell noch valide ist
 * UND wie sich das Auto-Send-Verhalten in den letzten 24h verhalten hat.
 *
 * Wird von der Leadmaschine-Admin-UI aufgerufen, um eine rote Warnung
 * mit konkreten Next-Steps anzuzeigen, wenn Versand seit Stunden failed.
 */
export async function GET() {
  const ctx = await requireAdminMutationContext();
  if (!ctx.ok) {
    return NextResponse.json(
      { error: ctx.error },
      { status: ctx.status, headers: NO_STORE_HEADERS },
    );
  }

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [errorsRes, successRes] = await Promise.all([
    ctx.service
      .from("lead_outreach_events")
      .select("metadata, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(500),
    ctx.service
      .from("lead_outreach_events")
      .select("created_at")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  let recentInvalidGrant = 0;
  let recentAutoSendErrors = 0;
  for (const row of errorsRes.data ?? []) {
    const metadata = (row as { metadata?: unknown }).metadata as
      | { auto_send_error?: unknown }
      | null;
    const err = metadata?.auto_send_error;
    if (typeof err !== "string" || err.length === 0) continue;
    recentAutoSendErrors += 1;
    if (err.toLowerCase().includes("invalid_grant")) {
      recentInvalidGrant += 1;
    }
  }

  const lastSuccessfulAutoSendAt =
    typeof (successRes.data?.[0] as { created_at?: unknown } | undefined)
      ?.created_at === "string"
      ? ((successRes.data?.[0] as { created_at: string }).created_at)
      : null;

  const clientId = sanitizeEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitizeEnv(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = sanitizeEnv(process.env.GOOGLE_REFRESH_TOKEN);

  if (!clientId || !clientSecret || !refreshToken) {
    const health: Health = {
      status: "missing_env",
      oauth_ok: false,
      oauth_error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN fehlen.",
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint: "ENV-Variablen auf Vercel pruefen (Production + Preview + Development) und redeployen.",
      docs_url: DOCS_URL,
    };
    return NextResponse.json(health, { headers: NO_STORE_HEADERS });
  }

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const token = await oauth2.getAccessToken();

    if (!token.token) {
      const health: Health = {
        status: "unknown_oauth_error",
        oauth_ok: false,
        oauth_error: "getAccessToken() lieferte keinen Token zurueck.",
        recent_invalid_grant_24h: recentInvalidGrant,
        recent_auto_send_errors_24h: recentAutoSendErrors,
        last_successful_auto_send_at: lastSuccessfulAutoSendAt,
        hint: "Refresh-Token neu holen (Doku) und in Vercel-ENV ersetzen.",
        docs_url: DOCS_URL,
      };
      return NextResponse.json(health, { headers: NO_STORE_HEADERS });
    }

    const health: Health = {
      status: "ok",
      oauth_ok: true,
      oauth_error: null,
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint:
        recentInvalidGrant > 0
          ? "OAuth-Token ist jetzt wieder gueltig, aber innerhalb der letzten 24h sind Sends mit invalid_grant fehlgeschlagen. Drafts in der Pipeline pruefen und ggf. manuell neu senden."
          : "Gmail-OAuth ist aktiv. Auto-Send laeuft normal.",
      docs_url: DOCS_URL,
    };
    return NextResponse.json(health, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isInvalidGrant = /invalid_grant/i.test(message);
    const health: Health = {
      status: isInvalidGrant ? "invalid_grant" : "unknown_oauth_error",
      oauth_ok: false,
      oauth_error: message.slice(0, 240),
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint: isInvalidGrant
        ? [
            "Refresh-Token ist abgelaufen oder widerrufen.",
            "Ursachen: OAuth-Consent-Screen steht auf Testing (7-Tage-Limit), Gmail-Passwort wurde geaendert, Token wurde manuell entzogen, oder Scopes wurden geaendert.",
            "Fix: 1) Doku oeffnen (siehe docs_url). 2) Neuen Refresh-Token via OAuth Playground holen. 3) GOOGLE_REFRESH_TOKEN in Vercel ersetzen (Production + Preview + Development). 4) Redeploy. 5) Optional: OAuth-Consent-Screen auf Production publishen, dann faellt das 7-Tage-Limit weg.",
          ].join(" ")
        : "Unerwarteter OAuth-Fehler. Doku pruefen und ggf. Refresh-Token erneuern.",
      docs_url: DOCS_URL,
    };
    return NextResponse.json(health, { headers: NO_STORE_HEADERS });
  }
}
