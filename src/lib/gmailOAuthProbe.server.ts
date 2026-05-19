import { google } from "googleapis";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export type GmailOAuthProbeResult =
  | { ok: true }
  | {
      ok: false;
      code: "missing_env" | "invalid_grant" | "no_access_token" | "unknown";
      message: string;
    };

/**
 * Prüft, ob GOOGLE_REFRESH_TOKEN noch ein Access Token liefern kann (Leadmaschine-Gmail).
 */
export async function probeGmailRefreshToken(): Promise<GmailOAuthProbeResult> {
  const clientId = sanitizeEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitizeEnv(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = sanitizeEnv(process.env.GOOGLE_REFRESH_TOKEN);

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      ok: false,
      code: "missing_env",
      message: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN fehlen.",
    };
  }

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const token = await oauth2.getAccessToken();
    if (!token.token) {
      return {
        ok: false,
        code: "no_access_token",
        message: "getAccessToken() lieferte keinen Token.",
      };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isInvalidGrant = /invalid_grant/i.test(message);
    return {
      ok: false,
      code: isInvalidGrant ? "invalid_grant" : "unknown",
      message: message.slice(0, 280),
    };
  }
}
