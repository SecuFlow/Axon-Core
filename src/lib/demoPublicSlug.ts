/**
 * Demo-URL-Parameter (`?demo=`) — geteilt zwischen Client (Admin-UI) und Server (Gast-Kontext).
 */

export function normalizeDemoKey(raw: string): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!s.includes(".")) return `${s}.com`;
  try {
    if (s.startsWith("http://") || s.startsWith("https://")) {
      const u = new URL(s);
      return u.hostname?.toLowerCase() || null;
    }
  } catch {
    // ignore
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

const DEMO_NAME = /^DEMO:(.+)$/i;

export function demoQueryParamForCompany(row: {
  id: string;
  name: string | null;
}): string {
  const name = (row.name ?? "").trim();
  const m = DEMO_NAME.exec(name);
  if (m) {
    const inner = m[1].trim();
    return normalizeDemoKey(inner) ?? inner;
  }
  return row.id;
}

export function isUuidDemoParam(raw: string): boolean {
  const s = raw.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
