import { randomBytes } from "node:crypto";

/** Öffentliche Produkt-URL (für E-Mail-Signaturen, immer https + Trailing Slash konsistent) */
export const AXON_PUBLIC_SITE_URL = "https://www.axon-core.de/";

/** Kleines Icon für HTML-Mails (gleiche Domain, damit keine Mixed-Content-Probleme) */
export const AXON_EMAIL_LOGO_URL = "https://www.axon-core.de/icon.png";

function normalizeNewlines(body: string): string {
  return body.replace(/\r\n/g, "\n");
}

const SITE_LINE = AXON_PUBLIC_SITE_URL.replace(/\r\n/g, "\n");

/** Fließtext-Signatur ohne Reply-Token (Willkommen, interne Hinweise). */
export function appendBrandSignaturePlain(body: string): string {
  const b = normalizeNewlines(body).trimEnd();
  const needle = `AXON Core\n${SITE_LINE}`;
  if (b.endsWith(needle)) return b;
  return `${b}\n\n${needle}`;
}

/**
 * Reply-Token nur noch im Body ([AXON-…]), damit der Betreff beim Empfänger sauber bleibt.
 * Inbound-Erkennung: extractReplyTokenFromText() auf Subject oder Body.
 */
export function appendLeadReplyAndBrandFooterPlain(body: string, token: string): string {
  const t = token.trim();
  const ref = `[AXON-${t}]`;
  let b = normalizeNewlines(body).trimEnd();
  if (!b.includes(ref)) {
    b = `${b}\n\n—\n${ref}`;
  }
  return appendBrandSignaturePlain(b);
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainToHtmlEmail(plain: string): string {
  const site = AXON_PUBLIC_SITE_URL.replace(/\/$/, "");
  const lines = normalizeNewlines(plain).split("\n");
  const br = lines.map((line) => escapeHtmlText(line)).join("<br>\n");
  const footer = `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e5e5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#444;">
<a href="${site}/" style="color:#111;text-decoration:none;display:inline-flex;align-items:center;gap:8px;">
<img src="${AXON_EMAIL_LOGO_URL}" width="22" height="22" alt="" style="display:block;border:0;vertical-align:middle;">
<span style="text-decoration:underline;">www.axon-core.de</span>
</a></div>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#222;">
${br}
${footer}
</body></html>`;
}

/**
 * Gmail-kompatibles multipart/alternative: gleicher Inhalt als text + HTML (mit kleinem Logo-Link).
 */
export function buildMultipartAlternativeRfc822(input: {
  from: string;
  to: string;
  subject: string;
  textBody: string;
}): string {
  const boundary = `----=_Axon_${randomBytes(16).toString("hex")}`;
  const subject = input.subject.replace(/\r?\n/g, " ").trim();
  const text = normalizeNewlines(input.textBody).replace(/\n/g, "\r\n");
  const htmlRaw = plainToHtmlEmail(input.textBody);
  const html = normalizeNewlines(htmlRaw).replace(/\n/g, "\r\n");
  return [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
