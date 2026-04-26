import { google } from "googleapis";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

export function getGmailUserEmail(): string {
  const user = sanitizeEnv(process.env.GMAIL_USER_EMAIL);
  if (!user) {
    throw new Error("GMAIL_USER_EMAIL fehlt (z. B. leadmaschine@deine-domain.de).");
  }
  return user;
}

export function getGmailClient() {
  const clientId = sanitizeEnv(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = sanitizeEnv(process.env.GOOGLE_CLIENT_SECRET);
  const refreshToken = sanitizeEnv(process.env.GOOGLE_REFRESH_TOKEN);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth fehlt: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN.",
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export async function getMessageHeaders(input: {
  userId: string;
  messageId: string;
}) {
  const gmail = getGmailClient();
  const res = await gmail.users.messages.get({
    userId: input.userId,
    id: input.messageId,
    format: "metadata",
    metadataHeaders: ["Subject", "From", "To", "Date"],
  });
  const headers = res.data.payload?.headers ?? [];
  const get = (name: string) =>
    headers.find((h) => (h.name ?? "").toLowerCase() === name.toLowerCase())
      ?.value ?? null;
  return {
    subject: get("Subject"),
    from: get("From"),
    to: get("To"),
    date: get("Date"),
    snippet: typeof res.data.snippet === "string" ? res.data.snippet : null,
  };
}

