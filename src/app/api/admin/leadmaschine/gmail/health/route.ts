import { NextResponse } from "next/server";
import { requireAdminMutationContext } from "@/app/admin/hq/_lib/requireAdminMutationContext";
import { probeGmailRefreshToken } from "@/lib/gmailOAuthProbe.server";
import { fetchLeadOutreachSendStats24h } from "@/lib/leadOutreachEventStats.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

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

  const stats = await fetchLeadOutreachSendStats24h(ctx.service);
  const recentInvalidGrant = stats.recent_invalid_grant_24h;
  const recentAutoSendErrors = stats.recent_auto_send_errors_24h;
  const lastSuccessfulAutoSendAt = stats.last_successful_auto_send_at;

  const gmail = await probeGmailRefreshToken();

  if (!gmail.ok && gmail.code === "missing_env") {
    const health: Health = {
      status: "missing_env",
      oauth_ok: false,
      oauth_error:
        typeof gmail.message === "string" ? gmail.message : "OAuth-Umgebung unvollständig.",
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint: "ENV-Variablen auf Vercel pruefen (Production + Preview + Development) und redeployen.",
      docs_url: DOCS_URL,
    };
    return NextResponse.json(health, { headers: NO_STORE_HEADERS });
  }

  if (!gmail.ok && gmail.code === "no_access_token") {
    const health: Health = {
      status: "unknown_oauth_error",
      oauth_ok: false,
      oauth_error: gmail.message,
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint: "Refresh-Token neu holen (Doku) und in Vercel-ENV ersetzen.",
      docs_url: DOCS_URL,
    };
    return NextResponse.json(health, { headers: NO_STORE_HEADERS });
  }

  if (!gmail.ok && gmail.code === "invalid_grant") {
    const health: Health = {
      status: "invalid_grant",
      oauth_ok: false,
      oauth_error: gmail.message.slice(0, 240),
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint: [
        "Refresh-Token ist abgelaufen oder widerrufen.",
        "Ursachen: OAuth-Consent-Screen steht auf Testing (7-Tage-Limit), Gmail-Passwort wurde geaendert, Token wurde manuell entzogen, oder Scopes wurden geaendert.",
        "Fix: 1) Doku oeffnen (siehe docs_url). 2) Neuen Refresh-Token via OAuth Playground holen. 3) GOOGLE_REFRESH_TOKEN in Vercel ersetzen (Production + Preview + Development). 4) Redeploy. 5) Optional: OAuth-Consent-Screen auf Production publishen, dann faellt das 7-Tage-Limit weg.",
      ].join(" "),
      docs_url: DOCS_URL,
    };
    return NextResponse.json(health, { headers: NO_STORE_HEADERS });
  }

  if (!gmail.ok) {
    const health: Health = {
      status: "unknown_oauth_error",
      oauth_ok: false,
      oauth_error: gmail.message.slice(0, 240),
      recent_invalid_grant_24h: recentInvalidGrant,
      recent_auto_send_errors_24h: recentAutoSendErrors,
      last_successful_auto_send_at: lastSuccessfulAutoSendAt,
      hint: "Unerwarteter OAuth-Fehler. Doku pruefen und ggf. Refresh-Token erneuern.",
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
}
