/**
 * Vorschau-Skript für Leadmaschine-Outreach-Mails.
 *
 * Ruft OpenAI mit IDENTISCHEN Prompts wie src/lib/leadOutreachCopy.server.ts
 * auf und gibt Subject + Body aus. Berührt Gmail NICHT — also keine Risiken.
 *
 * Verwendung:
 *   node --env-file=.env.local scripts/preview-outreach.mjs
 *
 * Konfiguriert wird der Test-Lead direkt im Block TEST_LEAD weiter unten.
 */

import OpenAI from "openai";

// === Test-Lead (frei editierbar) ===========================================
const TEST_LEAD = {
  // Welche Mail-Stage simulieren? "mail_1" | "follow_up" | "demo"
  kind: "demo",

  lead_segment: "enterprise", // "enterprise" | "smb"
  company_name: "Mosaik Verpackung GmbH",
  domain: "mosaik-verpackung.de",
  industry: "Verpackungsindustrie",
  market_segment: "Lebensmittelverpackung",
  employee_count: 320,
  revenue_eur: 78_000_000,
  hq_location: "Neuss, Deutschland",

  manager_name: "Anna Müller",
  linkedin_url: "https://www.linkedin.com/in/anna-mueller-werkleiterin/",
  corporate_group_name: "Mosaik Holding",
  location_name: "Werk Neuss",
  department: "Produktion / Werkleitung",

  // Optional: Research-Notes als Kontext
  research_context:
    "Standort Neuss verarbeitet vorwiegend Tiefkühl-Verpackungen für Lebensmittelproduzenten. " +
    "Hohe Fluktuation in der Produktion (3-Schicht-Modell), Werkleiterin Anna Müller hat laut LinkedIn " +
    "kürzlich über 'Wissensaufbau bei Schichtwechsel' gepostet. Konzern hat zwei weitere Werke (Aschaffenburg, Wien).",
};

// Optional: vorhandenen Test-Token aus der DB nutzen (echter Klick-Link).
// Wenn leer, wird ein Platzhalter <PREVIEW_TOKEN> benutzt.
const PREVIEW_TOKEN_OVERRIDE = "OU2iNW_Ow1uk1JOOy9DfqjEp";

const PREVIEW_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\s/g, "")?.replace(/\/+$/g, "") ??
  "https://axon-core-programm-secuflows-projects.vercel.app";
// ============================================================================

function sanitizeEnv(value) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function tryGetOpenAi() {
  const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function salutation(lead) {
  const name = typeof lead.manager_name === "string" ? lead.manager_name.trim() : "";
  if (!name) return "Guten Tag";
  return `Sehr geehrte/r ${name}`;
}

function compactCompanyFacts(lead) {
  const parts = [
    lead.corporate_group_name ? `Konzern: ${lead.corporate_group_name}` : null,
    lead.location_name ? `Standort: ${lead.location_name}` : null,
    lead.manager_name ? `Manager: ${lead.manager_name}` : null,
    lead.department ? `Abteilung: ${lead.department}` : null,
    lead.linkedin_url ? `LinkedIn: ${lead.linkedin_url}` : null,
    lead.domain ? `Domain: ${lead.domain}` : null,
    lead.industry ? `Branche: ${lead.industry}` : null,
    lead.market_segment ? `Segment: ${lead.market_segment}` : null,
    typeof lead.employee_count === "number" ? `Mitarbeiter: ${lead.employee_count}` : null,
    typeof lead.revenue_eur === "number" ? `Umsatz EUR/Jahr: ${lead.revenue_eur}` : null,
    lead.hq_location ? `HQ: ${lead.hq_location}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function compactResearch(lead) {
  const rc = typeof lead.research_context === "string" ? lead.research_context.trim() : "";
  if (!rc) return null;
  return rc.length > 1600 ? `${rc.slice(0, 1600)}…` : rc;
}

function defaultMessage(kind, lead) {
  const company = lead.company_name;
  const smb = lead.lead_segment === "smb";
  const hi = salutation(lead);
  const locationLabel =
    lead.location_name && lead.corporate_group_name
      ? `${lead.corporate_group_name} ${lead.location_name}`
      : lead.corporate_group_name ?? company;

  if (kind === "mail_1") {
    if (smb) {
      return {
        subject: `Kurz & konkret: digitales Betriebsgedächtnis für ${locationLabel}`,
        body:
          `${hi},\n\n` +
          `in vielen KMU-Betrieben geht Know-how mit den Leuten verloren – nicht weil es fehlt, sondern weil es nirgends sauber gebündelt ist.\n\n` +
          `AxonCore hilft, Wissen direkt am Arbeitsplatz festzuhalten und wieder auffindbar zu machen – ohne zusätzliche Bürokratie.\n\n` +
          `Wenn das für ${company} passt: Darf ich Ihnen in 15 Minuten zeigen, wie der Einstieg bei Ihnen aussehen würde?\n\n` +
          `Viele Grüße\nElias Stadler`,
      };
    }
    return {
      subject: `Kurze Frage: Wissenssicherung bei ${locationLabel}`,
      body:
        `${hi},\n\n` +
        `bei Konzernen mit mehreren Standorten entsteht häufig ein kritischer Knowledge-Drain durch Fluktuation und fehlende digitale Wissenssicherung.\n\n` +
        `AxonCore ist das digitale Gedächtnis der Industrie: strukturierte Wissensaufnahme direkt an der Maschine, plus Priorisierung im Konzern-Dashboard.\n\n` +
        `Wenn das Thema bei ${locationLabel} relevant ist: Soll ich Ihnen eine präzise 15-Min-Demo entlang Ihrer Standort- und Maschinenstruktur vorbereiten?\n\n` +
        `Viele Grüße\nElias Stadler`,
    };
  }
  if (kind === "follow_up") {
    if (smb) {
      return {
        subject: `Follow-Up: Wissen im Betrieb sichern (${locationLabel})`,
        body:
          `${hi},\n\n` +
          `kurz nachgehakt: Viele Betriebe starten mit „mehr Dokumentation" – der Hebel ist aber oft, Wissen dort zu sichern, wo die Arbeit passiert.\n\n` +
          `AxonCore ist darauf ausgelegt, dass Teams im Alltag mitziehen – nicht noch ein Tool für die IT-Schublade.\n\n` +
          `Passt ein kurzes Fenster diese Woche für eine kompakte Demo mit Bezug zu ${company}?\n\n` +
          `Viele Grüße\nElias Stadler`,
      };
    }
    return {
      subject: `Follow-Up: Wissenssicherung & Standort-Skalierung (${locationLabel})`,
      body:
        `${hi},\n\n` +
        `kurz nachgehakt: Das Risiko ist selten „fehlende Dokumentation", sondern der Verlust von implizitem Fachwissen – genau dort, wo es teuer wird.\n\n` +
        `AxonCore sichert Wissen pro Standort/Maschine und macht es auditierbar – ohne dass Ihre Teams zusätzliche Administration spüren.\n\n` +
        `Passt ein kurzes Zeitfenster diese Woche, damit ich Ihnen den Ablauf für ${locationLabel} konkret zeige?\n\n` +
        `Viele Grüße\nElias Stadler`,
    };
  }
  if (smb) {
    return {
      subject: `Kurze Fachfrage: Web- & Voice-Agenten bei ${locationLabel}`,
      body:
        `${hi},\n\n` +
        `wir sehen bei vielen Betrieben den gleichen Engpass: Wissen sitzt verteilt, und gleichzeitig sollen digitale Kanäle (Website, Telefon/Voice) Antworten liefern — ohne dass jedes Mal alles neu erklärt werden muss.\n\n` +
        `Bevor wir über Produkte oder Demos sprechen, würde mich konkret interessieren:\n` +
        `Welche wiederkehrenden Kundenfragen oder internen Rückfragen würden Sie am liebsten zuerst durch einen Web-Agenten bzw. Voice-Agenten abfangen — und was hindert Sie heute daran?\n\n` +
        `Eine kurze Rückmeldung reicht; ich melde mich mit einer passenden Empfehlung.\n\n` +
        `Viele Grüße\nElias Stadler`,
    };
  }
  return {
    subject: `Demo für ${locationLabel} – Manager- & Werker-Sicht`,
    body:
      `${hi},\n\n` +
      `wie besprochen: anbei zwei Direkt-Einstiege in eine vorbereitete Demo zu ${locationLabel}.\n\n` +
      `Der Konzern-Link führt in das Manager-Dashboard mit KPIs, Standortübersicht und Maschinen-Inventar. Der Mitarbeiter-Link zeigt die Werker-Sicht direkt an der Maschine — dort wird Wissen sekundenschnell gesichert.\n\n` +
      `Wenn Sie nach dem Reinschauen 15 Minuten Zeit haben, gehe ich gerne mit Ihnen die nächsten Schritte für ${locationLabel} durch.\n\n` +
      `Viele Grüße\nElias Stadler`,
  };
}

async function generateOutreachMessage({ kind, lead }) {
  const openai = tryGetOpenAi();
  if (!openai) {
    const d = defaultMessage(kind, lead);
    return { ...d, model: null, source: "default-template" };
  }

  const model = (sanitizeEnv(process.env.OPENAI_GPT_MODEL) ?? "").trim() || "gpt-4o";
  const smb = lead.lead_segment === "smb";
  const hasManager =
    typeof lead.manager_name === "string" && lead.manager_name.trim().length > 0;
  const personalizationHint = hasManager
    ? " Der Empfänger ist ein konkreter Entscheider (Name liegt vor); nutze eine persönliche, sachliche Anrede (z. B. 'Sehr geehrte/r <Name>'). Greife – wo sinnvoll – Standort, Abteilung oder LinkedIn-Kontext dezent auf (nicht aufdringlich, keine Namensdropping-Floskeln)."
    : "";
  const system =
    smb && kind === "demo"
      ? "Du schreibst eine E-Mail an ein Kleinunternehmen / KMU in deutscher Sprache im Ton von Elias Stadler (Founder/CEO): wertschätzend, klar, pragmatisch. " +
        "Wichtig: KEINE Demo-Einladung, KEIN Demo-Link, kein 'wir zeigen Ihnen das Produkt'. Stattdessen eine präzise Beratungsfrage zu Web-Agenten und Voice-Agenten im Betrieb (Website, Telefon/IVR). " +
        "Keine technischen IDs, keine Slugs. Format: Betreff + Body als Plaintext. Länge: 95–150 Wörter. Eine klare Rückfrage am Ende." +
        personalizationHint
      : smb
      ? "Du schreibst eine Outreach-E-Mail an ein Kleinunternehmen / KMU in deutscher Sprache im Ton von Elias Stadler (Founder/CEO): wertschätzend, klar, pragmatisch, ohne Konzern-Jargon. " +
        "Fokus: Alltag im Betrieb, Know-how-Sicherung, geringe Reibung für Teams. Keine technischen IDs, keine Slugs, keine Demo-/Test-Wörter. " +
        "Format: Betreff + Body. Body als Plaintext mit Absätzen, ohne Markdown. " +
        "Länge: 95–150 Wörter. Klare Frage am Ende (Call-to-Action)." +
        personalizationHint
      : "Du schreibst eine Enterprise-Outreach E-Mail in deutscher Sprache im Ton von Elias Stadler (Founder/CEO): direkt, souverän, strategischer Mehrwert, keine Werbung, keine Floskeln. " +
        "Die E-Mail geht an einen konkret benannten Entscheider an einem Konzern-Standort (UWG §7-konform: B2B, sachlicher Bezug zur Rolle des Empfängers). " +
        "Keine technischen IDs, keine Slugs, keine Demo-/Test-Wörter. " +
        "Format: Betreff + Body. Body als Plaintext mit Absätzen, ohne Markdown. " +
        "Länge: 110–170 Wörter. Klare Frage am Ende (Call-to-Action)." +
        (kind === "demo"
          ? " WICHTIG: Im Anschluss an Deinen Body werden automatisch zwei Demo-Links angehängt — einer für das Konzern-Dashboard (Manager-Sicht: KPIs, Standorte, Maschinen) und einer für die Mitarbeiter-App (Werker-Sicht direkt an der Maschine). Führe diese beiden Sichten im Body inhaltlich ein, ABER schreibe selbst KEINE Links, KEINE URLs und KEINE Platzhalter — diese werden technisch ergänzt."
          : "") +
        personalizationHint;

  const user =
    `Lead (${smb ? "KMU / Kleinunternehmen" : "Enterprise-Konzernstandort"}):\n` +
    `Firma/Anzeigename: ${lead.company_name}\n` +
    `${compactCompanyFacts(lead)}\n\n` +
    `${compactResearch(lead) ? `${compactResearch(lead)}\n\n` : ""}` +
    `Message-Typ: ${kind}\n` +
    (smb && kind === "demo"
      ? "\n(Aufgabe: Beratungsfrage zu Web- und Voice-Agenten — keine Demo.)\n\n"
      : "\n") +
    `Gib strikt JSON:\n` +
    `{"subject": "...", "body": "..."}`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.25,
      max_tokens: 420,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw);
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!subject || !body) {
      const d = defaultMessage(kind, lead);
      return { ...d, model, source: "default-fallback (parse-fail)" };
    }
    return {
      subject: subject.slice(0, 200),
      body: body.slice(0, 6000),
      model,
      source: "openai",
    };
  } catch (e) {
    const d = defaultMessage(kind, lead);
    return { ...d, model, source: `default-fallback (error: ${e?.message ?? "unknown"})` };
  }
}

const SEPARATOR = "─".repeat(78);

console.log(`\n${SEPARATOR}`);
console.log("LEADMASCHINE — OUTREACH-VORSCHAU (kein Gmail-Versand)");
console.log(SEPARATOR);
console.log(`Stage:   ${TEST_LEAD.kind}`);
console.log(`Segment: ${TEST_LEAD.lead_segment}`);
console.log(`Lead:    ${TEST_LEAD.company_name} · ${TEST_LEAD.location_name}`);
console.log(`Manager: ${TEST_LEAD.manager_name} (${TEST_LEAD.department})`);
console.log(SEPARATOR);

const startedAt = Date.now();
const result = await generateOutreachMessage({ kind: TEST_LEAD.kind, lead: TEST_LEAD });
const elapsed = Date.now() - startedAt;

// Demo-Links wie der Runner anhaengen (nur fuer kind="demo" + enterprise).
// SMB bekommt stattdessen einen Booking-Link (siehe leadmaschineRunner.server.ts).
const seg = TEST_LEAD.lead_segment;
let finalBody = result.body;
let demoLinkKonzern = null;
let demoLinkWorker = null;
let bookingUrl = null;

if (TEST_LEAD.kind === "demo" && seg === "enterprise") {
  const token = PREVIEW_TOKEN_OVERRIDE || "<PREVIEW_TOKEN>";
  const tokenBase = `${PREVIEW_BASE_URL}/api/public/demo-link/${encodeURIComponent(token)}`;
  demoLinkKonzern = `${tokenBase}?app=konzern`;
  demoLinkWorker = `${tokenBase}?app=worker`;
  finalBody =
    `${result.body}\n\n` +
    `Konzern‑Dashboard (Manager-Sicht):\n${demoLinkKonzern}\n\n` +
    `Mitarbeiter‑App (Werker-Sicht direkt an der Maschine):\n${demoLinkWorker}`;
} else if (TEST_LEAD.kind === "demo" && seg === "smb") {
  bookingUrl =
    sanitizeEnv(process.env.AXON_SMB_BOOKING_URL) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_SMB_BOOKING_URL) ??
    sanitizeEnv(process.env.NEXT_PUBLIC_BOOKING_URL) ??
    null;
  if (bookingUrl) {
    finalBody = `${result.body}\n\nBeratungsgespräch buchen: ${bookingUrl}`;
  }
}

console.log(`\nQuelle:  ${result.source}`);
console.log(`Modell:  ${result.model ?? "(kein OpenAI, Fallback-Template)"}`);
console.log(`Dauer:   ${elapsed} ms\n`);
console.log(SEPARATOR);
console.log("BETREFF:");
console.log(SEPARATOR);
console.log(result.subject);
console.log("");
console.log(SEPARATOR);
console.log("BODY (FINAL — exakt wie an Gmail uebergeben):");
console.log(SEPARATOR);
console.log(finalBody);
console.log(SEPARATOR);

if (demoLinkKonzern || demoLinkWorker) {
  console.log("");
  console.log("Angefuegte Demo-Links:");
  if (demoLinkKonzern) console.log(`  Konzern: ${demoLinkKonzern}`);
  if (demoLinkWorker) console.log(`  Worker : ${demoLinkWorker}`);
  console.log(SEPARATOR);
}

function sanitizeLocalPart(raw) {
  // Erst deutsche Umlaute transliterieren (ae/oe/ue/ss), DANN NFKD-Strip.
  const transliterated = raw
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");
  return transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function emailPatternsFor(managerName, domain) {
  const tokens = managerName.replace(/^(Herr|Frau|Dr\.?|Prof\.?)\s+/i, "").split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return [];
  const first = sanitizeLocalPart(tokens[0]);
  const last = sanitizeLocalPart(tokens[tokens.length - 1]);
  if (!first || !last) return [];
  return [
    `${first}.${last}@${domain}`,
    `${first.charAt(0)}.${last}@${domain}`,
    `${first}${last}@${domain}`,
  ];
}

const wordCount = result.body.split(/\s+/).filter(Boolean).length;
const patterns = emailPatternsFor(TEST_LEAD.manager_name, TEST_LEAD.domain);
console.log(`Wörter im Body:  ${wordCount}`);
console.log(`Empfänger-Kandidaten (Top 3 Pattern):`);
for (const p of patterns) console.log(`  → ${p}`);
console.log(`Absender im Live-Run: ${process.env.GMAIL_USER_EMAIL ?? "(GMAIL_USER_EMAIL unset)"}`);
console.log(SEPARATOR);
console.log("");
