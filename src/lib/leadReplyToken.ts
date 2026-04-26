export function generateLeadReplyToken(): string {
  // kurz, URL/Subject-sicher, ohne Sonderzeichen
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function appendReplyTokenToSubject(subject: string, token: string): string {
  const s = subject.trim();
  const t = token.trim();
  if (!s) return `[AXON-${t}]`;
  if (s.includes(`[AXON-${t}]`)) return s;
  return `${s} [AXON-${t}]`;
}

export function extractReplyTokenFromText(raw: string): string | null {
  const s = raw ?? "";
  const m = s.match(/\[AXON-([A-Z0-9]{8,16})\]/i);
  if (!m) return null;
  const token = m[1].toUpperCase();
  return /^[A-Z0-9]{8,16}$/.test(token) ? token : null;
}

