/**
 * LLM-basierte ICP-Vorqualifikation fuer Apollo-Leads.
 *
 * Wird NACH dem Echtheits-Check ausgefuehrt. Ziel: subjektive Bewertung,
 * ob Firma+Person zum Axon-Core ICP passen, anhand von:
 *   - Branche (gehoert sie zur Industrie/Logistik/Produktion?)
 *   - Groesse (Mindestumsatz, Mitarbeiter)
 *   - "Mindset" (deutet die Firma auf Wissensmanagement-Pain hin?)
 *
 * Output: qualified, score (1-10), reason (1-Satz Begruendung).
 *
 * Defensive Defaults:
 *   - Bei OPENAI_API_KEY fehlt -> Lead wird durchgewinkt (Fallback)
 *   - Bei API-Error -> Lead wird durchgewinkt (Fallback, mit error-Flag)
 *   - Bei JSON-Parse-Fehler -> Lead wird gedropped (sicher)
 *
 * Token-Budget: ~600 input + ~150 output Tokens pro Lead.
 * Bei gpt-4.1: ~$0.005 pro Lead. Bei 30 Search-Treffern -> ~$0.15/Run.
 */

import OpenAI from "openai";
import type { ApolloEnrichedPerson } from "@/lib/apolloClient.server";

export type QualifierInput = {
  person: ApolloEnrichedPerson;
  segment: "enterprise" | "smb";
  thresholds: {
    score: number; // 1-10
    min_revenue_eur: number; // 0 = ignorieren
  };
  blacklist_industries: string[];
};

export type QualifierResult = {
  qualified: boolean;
  score: number; // 1-10 (0 wenn LLM nicht erreichbar)
  reason: string;
  // Falls LLM nicht aufrufbar oder geparst werden konnte. Bei true wird
  // der Lead durchgewinkt (defensiv) und nur in qualification_summary
  // dokumentiert.
  error?: string;
};

const QUALIFIER_MODEL = "gpt-4.1-mini";

function sanitize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function tryGetOpenAi(): OpenAI | null {
  const apiKey = sanitize(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function compactPerson(person: ApolloEnrichedPerson): string {
  const name =
    [person.first_name, person.last_name].filter(Boolean).join(" ").trim() ||
    person.name ||
    "?";
  const lines = [
    `Person: ${name}`,
    person.title ? `Titel: ${person.title}` : null,
    person.headline ? `LinkedIn-Headline: ${person.headline}` : null,
    person.seniority ? `Seniority: ${person.seniority}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function compactCompany(person: ApolloEnrichedPerson): string {
  const o = person.organization;
  if (!o) return "Firma: (keine Daten)";
  const lines = [
    `Firma: ${o.name ?? "?"}`,
    o.industry ? `Branche: ${o.industry}` : null,
    o.estimated_num_employees
      ? `Mitarbeiter (geschaetzt): ${o.estimated_num_employees}`
      : null,
    o.annual_revenue
      ? `Jahresumsatz: ${formatRevenue(o.annual_revenue)}`
      : "Jahresumsatz: unbekannt",
    o.country ? `Land: ${o.country}` : null,
    o.city ? `Stadt: ${o.city}` : null,
    o.short_description
      ? `Beschreibung: ${o.short_description.slice(0, 280)}`
      : null,
    o.founded_year ? `Gruendungsjahr: ${o.founded_year}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function formatRevenue(eur: number): string {
  if (!Number.isFinite(eur) || eur <= 0) return "unbekannt";
  if (eur >= 1_000_000_000) return `~${(eur / 1_000_000_000).toFixed(1)} Mrd EUR`;
  if (eur >= 1_000_000) return `~${(eur / 1_000_000).toFixed(0)} Mio EUR`;
  return `${Math.round(eur)} EUR`;
}

function buildSystemPrompt(input: QualifierInput): string {
  const segmentText =
    input.segment === "enterprise"
      ? "Enterprise (mittelstaendisch bis Konzern, 100-5000 Mitarbeiter, Mindestumsatz ca. 50 Mio EUR)"
      : "SMB (kleinere Mittelstaendler, 5-99 Mitarbeiter, Mindestumsatz ca. 5 Mio EUR)";

  const minRev =
    input.thresholds.min_revenue_eur > 0
      ? `Mindest-Jahresumsatz: ${formatRevenue(input.thresholds.min_revenue_eur)}.`
      : "";

  const blacklistStr =
    input.blacklist_industries.length > 0
      ? input.blacklist_industries.map((i) => `"${i}"`).join(", ")
      : "(keine zusaetzlichen)";

  return [
    "Du bist ein praeziser ICP-Filter fuer AxonCore.",
    "",
    "AxonCore ist eine Wissensmanagement-Plattform fuer Industrieunternehmen mit",
    "Schichtbetrieb, hoher Fluktuation oder Generationswechsel. Kunden sichern",
    "kritisches Erfahrungswissen (Werkleiter/Schichtleiter/Meister) digital ab,",
    "damit es bei Personalwechsel nicht verloren geht.",
    "",
    `Du bewertest, ob diese Firma+Person fuer das Segment ${segmentText} qualifiziert ist.`,
    "",
    "QUALIFIZIERTE Branchen (Beispiele):",
    "  produzierende Industrie, Maschinenbau, Automotive, Chemie, Pharma,",
    "  Bauwirtschaft/Bauchemie, Logistik (Kontraktlogistik/Werkslogistik),",
    "  Lebensmittel-/Getraenke-Produktion, Energie/Versorger, Holz/Papier,",
    "  Kunststoff/Verpackung, Metall, Textilproduktion, Werften,",
    "  produzierendes Handwerk mit Werkstaetten",
    "",
    "DISQUALIFIZIERENDE Branchen (immer score <=4):",
    "  Marketing/Werbung/PR, Recruiting/Staffing, Personalvermittlung,",
    "  IT-Beratung/Software/SaaS/Tech-Startups, Werbeagenturen,",
    "  Unternehmensberatung, Banken/Finanz/VC/PE, Steuerberatung/Anwalt,",
    "  Wissenschaft/Forschung ohne Produktion, Vereine/NGOs,",
    "  reine Dienstleistung ohne physische Produktion",
    `  Zusaetzlich von dir geblockt: ${blacklistStr}`,
    "",
    "QUALITAETS-Signale (heben den Score):",
    "  - viele Mitarbeiter pro Standort (Schichtbetrieb wahrscheinlich)",
    "  - mehrere Standorte (standortuebergreifender Wissenstransfer relevant)",
    "  - traditionelle Industrie/aelteres Gruendungsjahr (Generationswechsel-Pain)",
    "  - klar produzierende Beschreibung (\"Werk\", \"Anlage\", \"Fertigung\", \"Produktion\")",
    "  - Person hat operativen Titel (Werkleiter, Plant Manager, Standortleiter)",
    "",
    "PENALTY-Signale (senken den Score):",
    "  - Firma zu klein fuer das Segment (siehe Mindest-Umsatz/-Mitarbeiter)",
    "  - keine echte Produktion erkennbar (nur Vertrieb/Service/Holding)",
    "  - Branche im disqualifizierenden Bereich",
    "  - Beschreibung deutet auf Software/SaaS/Beratung hin",
    "  - Person hat keinen produktionsnahen Titel",
    "",
    minRev,
    "",
    "Score-Skala:",
    "  10 = Idealkunde, sofort kontaktieren",
    "  8-9 = sehr guter Fit",
    "  7   = guter Fit (Default-Threshold)",
    "  5-6 = grenzwertig, eher nicht",
    "  1-4 = klar disqualifiziert",
    "",
    "Antworte ausschliesslich als kompaktes JSON:",
    '  {"score": <1-10>, "qualified": <bool>, "reason": "<1 Satz, max 140 Zeichen>"}',
    "",
    "qualified=true nur wenn score >= " + input.thresholds.score + ".",
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");
}

function buildUserPrompt(person: ApolloEnrichedPerson): string {
  return [compactCompany(person), "", compactPerson(person)].join("\n");
}

function parseLlmJson(raw: string): { score: number; qualified: boolean; reason: string } | null {
  // Robust gegen Whitespace, Code-Fences oder " json"-Prefixes.
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const score =
    typeof o.score === "number"
      ? o.score
      : typeof o.score === "string"
        ? Number(o.score)
        : NaN;
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;
  const reason =
    typeof o.reason === "string" && o.reason.trim() ? o.reason.trim().slice(0, 200) : "";
  const qualified = o.qualified === true;
  return { score: Math.round(score), qualified, reason };
}

export async function qualifyApolloLead(
  input: QualifierInput,
): Promise<QualifierResult> {
  const openai = tryGetOpenAi();
  if (!openai) {
    // Defensiver Fallback: ohne OpenAI Key kein LLM-Filter, aber Lead durchwinken.
    return {
      qualified: true,
      score: 0,
      reason: "(LLM-Filter inaktiv: OPENAI_API_KEY fehlt)",
      error: "openai_key_missing",
    };
  }

  // Extra-Sicherheit: bei klar zu kleinem Umsatz hard-block bevor LLM aufgerufen wird.
  const minRev = input.thresholds.min_revenue_eur;
  const rev = input.person.organization?.annual_revenue;
  if (minRev > 0 && typeof rev === "number" && Number.isFinite(rev) && rev > 0 && rev < minRev) {
    return {
      qualified: false,
      score: 3,
      reason: `Umsatz ${formatRevenue(rev)} < Mindest ${formatRevenue(minRev)}`,
    };
  }

  const system = buildSystemPrompt(input);
  const user = buildUserPrompt(input.person);

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: QUALIFIER_MODEL,
      temperature: 0.1, // deterministisch
      max_tokens: 200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Defensiver Fallback: bei API-Error wird der Lead durchgewinkt, aber
    // mit error-Flag fuer Audit. Sonst zerbricht ein OpenAI-Outage die ganze
    // Lead-Pipeline.
    return {
      qualified: true,
      score: 0,
      reason: "(LLM-Aufruf fehlgeschlagen, Lead durchgewinkt)",
      error: msg.slice(0, 200),
    };
  }

  const parsed = parseLlmJson(raw);
  if (!parsed) {
    // Konservativ: bei nicht parsebarer Antwort lieber DROPPEN.
    return {
      qualified: false,
      score: 0,
      reason: "(LLM-Output nicht parsebar)",
      error: "parse_error",
    };
  }

  // qualified-Flag aus LLM-Output ist informativ; Threshold gilt zusaetzlich.
  const finalQualified = parsed.qualified && parsed.score >= input.thresholds.score;
  return {
    qualified: finalQualified,
    score: parsed.score,
    reason: parsed.reason || (finalQualified ? "ICP-Fit" : "kein ICP-Fit"),
  };
}
