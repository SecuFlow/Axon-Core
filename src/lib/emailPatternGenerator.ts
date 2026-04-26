/**
 * Email-Pattern-Generator fuer LinkedIn-Prospects.
 *
 * Liefert eine priorisierte Liste plausibler B2B-Email-Adressen aus
 * Manager-Name + Firmen-Domain. Keine externen Services, reines
 * Heuristik-Pattern-Matching.
 *
 * Die erste Pattern-Variante (vorname.nachname@domain) ist die mit
 * Abstand haeufigste Konvention im DACH-Raum.
 */

function stripAccents(input: string): string {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function sanitizeLocalPart(raw: string): string {
  return stripAccents(raw)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function sanitizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!s) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

type Parts = { first: string; last: string; middle: string[] };

/**
 * Trennt einen Namen in Vor- / Mittel- / Nachname.
 *
 * Beispiele:
 *   "Dr. Max Mustermann"          -> first=max, last=mustermann
 *   "Max Peter von der Muehlen"   -> first=max, last=muehlen (Praefixe "von der" werden verworfen)
 *   "Herr Max Mustermann"         -> first=max, last=mustermann
 */
export function splitManagerName(raw: string): Parts | null {
  if (typeof raw !== "string") return null;
  const normalized = raw
    .trim()
    .replace(/\s+/g, " ")
    // Titel/Anreden entfernen
    .replace(/^(Herr|Frau|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|Dipl\.?[\s-]?(Ing|Kfm|Inf)?\.?|Mag\.?|Ph\.?D\.?)\s+/i, "")
    .replace(/^(Herr|Frau|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, "");
  if (!normalized) return null;

  // Komma-Notation: "Mustermann, Max" -> "Max Mustermann"
  let tokens: string[];
  if (normalized.includes(",")) {
    const [lastChunk, firstChunk] = normalized.split(",", 2);
    const flipped = `${firstChunk.trim()} ${lastChunk.trim()}`.trim();
    tokens = flipped.split(" ").filter(Boolean);
  } else {
    tokens = normalized.split(" ").filter(Boolean);
  }
  if (tokens.length < 2) return null;

  // Adels-/Namens-Praefixe vor Nachnamen filtern.
  const prefixes = new Set(["von", "van", "de", "der", "den", "des", "la", "le", "zu", "zur"]);

  const first = sanitizeLocalPart(tokens[0]);
  // Nachname = letztes Token, das KEIN Praefix ist.
  let lastIdx = tokens.length - 1;
  while (lastIdx > 0 && prefixes.has(tokens[lastIdx].toLowerCase())) lastIdx -= 1;
  const last = sanitizeLocalPart(tokens[lastIdx]);
  const middle: string[] = [];
  for (let i = 1; i < lastIdx; i += 1) {
    const part = tokens[i];
    if (prefixes.has(part.toLowerCase())) continue;
    const cleaned = sanitizeLocalPart(part);
    if (cleaned.length > 0) middle.push(cleaned);
  }

  if (!first || !last) return null;
  return { first, last, middle };
}

/**
 * Liefert priorisierte Email-Pattern fuer einen B2B-Manager.
 *
 * @returns leeres Array wenn Name oder Domain nicht verwertbar sind.
 */
export function generateEmailPatterns(input: {
  managerName: string;
  domain: string;
}): string[] {
  const parts = splitManagerName(input.managerName);
  const domain = sanitizeDomain(input.domain);
  if (!parts || !domain) return [];

  const { first, last } = parts;
  const fInitial = first.charAt(0);
  const lInitial = last.charAt(0);

  const candidates: string[] = [
    `${first}.${last}@${domain}`, // Primaer (DACH-Standard ~70%)
    `${fInitial}.${last}@${domain}`, // v.nachname@
    `${first}${last}@${domain}`, // vornamenachname@
    `${first}-${last}@${domain}`, // vorname-nachname@
    `${first}_${last}@${domain}`, // vorname_nachname@
    `${last}.${first}@${domain}`, // nachname.vorname@
    `${last}@${domain}`, // nachname@
    `${first}@${domain}`, // vorname@
    `${fInitial}${last}@${domain}`, // vnachname@
    `${first}${lInitial}@${domain}`, // vornamen@
  ];

  // Dedupliziere, behalte Reihenfolge.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * Leitet eine plausible Firmen-Domain aus einem Konzernnamen ab,
 * falls keine Domain bekannt ist. Beispiel: "Siemens AG" -> "siemens.de".
 *
 * Bewusst konservativ - wenn kein eindeutiger Stammname rauskommt,
 * wird null zurueckgegeben.
 */
export function guessDomainFromCorporateName(
  name: string,
  tld: "de" | "com" = "de",
): string | null {
  if (typeof name !== "string") return null;
  const stripped = stripAccents(name)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    // Rechtsformen entfernen
    .replace(/\b(ag|se|gmbh|kgaa|kg|ohg|ug|gbr|mbh|co|\&)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const token = stripped.split(/\s+/).filter(Boolean)[0];
  if (!token || token.length < 2) return null;
  return `${token}.${tld}`;
}
