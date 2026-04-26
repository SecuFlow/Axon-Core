/**
 * Matrix-Riss Google-Dork Template.
 *
 * Baut den Google-Suchstring fuer LinkedIn-Profile von Standort-Managern
 * nach der vorgegebenen Spec.
 *
 * Rolle-Keywords bewusst als Konstante gehalten, damit Aenderungen
 * zentral erfolgen koennen.
 */

export const MATRIX_ROLE_KEYWORDS = [
  "Werkleiter",
  "Standortleiter",
  "Plant Manager",
  "Betriebsleiter",
] as const;

export type MatrixDorkInput = {
  city: string;
  /** Optional: Konzernname, wird nur eingefuegt wenn nicht leer. */
  company?: string | null;
};

/**
 * Erzeugt das rohe Google-Dork Query-String (ungeencoded).
 *
 * Beispiel mit company "Siemens", city "Muenchen":
 *   site:linkedin.com/in/ "Siemens" AND ("Werkleiter" OR "Standortleiter" OR "Plant Manager" OR "Betriebsleiter") AND "Muenchen"
 *
 * Ohne company:
 *   site:linkedin.com/in/ ("Werkleiter" OR "Standortleiter" OR "Plant Manager" OR "Betriebsleiter") AND "Muenchen"
 */
export function buildMatrixDorkQuery(input: MatrixDorkInput): string {
  const city = input.city.trim();
  const company = (input.company ?? "").trim();

  const rolesExpr = `(${MATRIX_ROLE_KEYWORDS.map((r) => `"${r}"`).join(" OR ")})`;
  const parts = [`site:linkedin.com/in/`];
  if (company) parts.push(`"${company}"`);
  parts.push(`AND ${rolesExpr}`);
  parts.push(`AND "${city}"`);
  return parts.join(" ");
}

/**
 * Baut den fertigen Google-Search-Link (URL-encoded).
 */
export function buildMatrixGoogleUrl(input: MatrixDorkInput): string {
  const q = buildMatrixDorkQuery(input);
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
