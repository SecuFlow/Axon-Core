export function generateLeadReplyToken(): string {
  // kurz, URL/Subject-sicher, ohne Sonderzeichen
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Betreff ohne technisches [AXON-…]-Suffix (Reply-Token liegt nur noch im Body). */
export function formatOutreachEmailSubject(subject: string): string {
  const s = subject.trim();
  if (s) return s;
  return "Nachricht von AXON Core";
}

/** @deprecated Token gehört nicht mehr in den Betreff — nutze formatOutreachEmailSubject + appendLeadReplyAndBrandFooterPlain */
export function appendReplyTokenToSubject(subject: string, _token: string): string {
  return formatOutreachEmailSubject(subject);
}

export function extractReplyTokenFromText(raw: string): string | null {
  const s = raw ?? "";
  const m = s.match(/\[AXON-([A-Z0-9]{8,16})\]/i);
  if (!m) return null;
  const token = m[1].toUpperCase();
  return /^[A-Z0-9]{8,16}$/.test(token) ? token : null;
}

