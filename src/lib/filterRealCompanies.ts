/** Namen, die wie E-Mail-Adressen wirken (keine echten Firmennamen). */
export function looksLikeEmailName(raw: string): boolean {
  const s = raw.trim();
  if (!s.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Echte Konzern-Zeilen: gültige tenant_id und kein E-Mail-Name. */
export function isRealCompanyOption(c: {
  name: string;
  tenantId: string | null;
}): boolean {
  if (typeof c.tenantId !== "string" || c.tenantId.trim().length === 0) {
    return false;
  }
  if (looksLikeEmailName(c.name)) return false;
  return true;
}
