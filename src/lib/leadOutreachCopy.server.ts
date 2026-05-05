import OpenAI from "openai";

type LeadInput = {
  company_name: string;
  domain: string | null;
  industry: string | null;
  market_segment: string | null;
  employee_count: number | null;
  revenue_eur: number | null;
  hq_location: string | null;
  /** enterprise = Großkunden-Flow; smb = Kleinunternehmer / KMU */
  lead_segment?: "enterprise" | "smb" | null;
  /** Optionaler Research-Kontext (kurz & präzise) */
  research_context?: string | null;
  /** Manuelle Anlage: konkreter Entscheider (UWG §7: B2B, konkreter Ansprechpartner) */
  manager_name?: string | null;
  linkedin_url?: string | null;
  corporate_group_name?: string | null;
  location_name?: string | null;
  department?: string | null;
};

type MessageKind = "mail_1" | "follow_up" | "demo";

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function tryGetOpenAi(): OpenAI | null {
  const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * Anrede.
 *
 * Apollo liefert Manager-Namen meist in der Form "Markus Schmidt".
 * Wir versuchen Genus-Heuristik fuer "Sehr geehrter Herr ..." / "Sehr geehrte Frau ...",
 * fallen aber auf neutrale Form zurueck, wenn unsicher.
 */
function salutation(lead: LeadInput): string {
  const name = typeof lead.manager_name === "string" ? lead.manager_name.trim() : "";
  if (!name) return "Hallo";
  if (/^Herr\s+/i.test(name)) return `Sehr geehrter ${name}`;
  if (/^Frau\s+/i.test(name)) return `Sehr geehrte ${name}`;
  // Neutrale, aber persoenliche Variante (kein "Sehr geehrte/r" — wirkt schablonenhaft).
  // Wir nutzen Vorname Nachname, mit "Hallo" als modernem, aber respektvollem Opener.
  return `Hallo ${name}`;
}

function formatHumanRevenue(r: number | null): string | null {
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) return null;
  if (r >= 1_000_000_000) return `${(r / 1_000_000_000).toFixed(1)} Mrd €/Jahr`;
  if (r >= 1_000_000) return `${(r / 1_000_000).toFixed(1)} Mio €/Jahr`;
  if (r >= 1_000) return `${Math.round(r / 1_000)} k €/Jahr`;
  return `${r} €/Jahr`;
}

function compactCompanyFacts(lead: LeadInput): string {
  const parts = [
    lead.corporate_group_name ? `Konzern: ${lead.corporate_group_name}` : null,
    lead.location_name ? `Standort: ${lead.location_name}` : null,
    lead.manager_name ? `Manager: ${lead.manager_name}` : null,
    lead.department ? `Position: ${lead.department}` : null,
    lead.linkedin_url ? `LinkedIn: ${lead.linkedin_url}` : null,
    lead.domain ? `Domain: ${lead.domain}` : null,
    lead.industry ? `Branche: ${lead.industry}` : null,
    typeof lead.employee_count === "number" ? `Mitarbeiter: ${lead.employee_count}` : null,
    formatHumanRevenue(lead.revenue_eur ?? null),
    lead.hq_location ? `HQ: ${lead.hq_location}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function compactResearch(lead: LeadInput): string | null {
  const rc = typeof lead.research_context === "string" ? lead.research_context.trim() : "";
  if (!rc) return null;
  return rc.length > 1600 ? `${rc.slice(0, 1600)}…` : rc;
}

function defaultMessage(kind: MessageKind, lead: LeadInput): { subject: string; body: string } {
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
        subject: `${locationLabel}: Wo geht heute Wissen verloren?`,
        body:
          `${hi},\n\n` +
          `kurze, ehrliche Frage: Wenn morgen einer Ihrer erfahrensten Mitarbeiter kuendigen wuerde – wieviel Spezialwissen waere weg?\n\n` +
          `Ich baue mit AxonCore das digitale Betriebsgedaechtnis fuer KMU. Wissen wird dort gesichert, wo es entsteht – am Arbeitsplatz, ohne extra Doku-Pflicht.\n\n` +
          `Wuerden 15 Minuten passen, damit ich Ihnen zeige wie das fuer ${company} aussehen koennte?\n\n` +
          `Viele Gruesse\nElias Stadler`,
      };
    }
    return {
      subject: `Werkleiter ${locationLabel}: Wer kennt das wirklich?`,
      body:
        `${hi},\n\n` +
        `als Werkleiter haben Sie vermutlich diese Situation oefter: Maschinen-spezifisches Wissen sitzt bei zwei oder drei Leuten – und genau die gehen frueher oder spaeter.\n\n` +
        `AxonCore ist das digitale Betriebsgedaechtnis fuer Industrie-Konzerne. Wissen wird direkt an der Maschine gesichert, im Konzern-Dashboard sichtbar gemacht und ueber Standorte hinweg vergleichbar.\n\n` +
        `Wenn das Thema bei ${locationLabel} relevant ist: 15 Minuten, ich zeige Ihnen die Werker-Sicht und das Konzern-Dashboard?\n\n` +
        `Viele Gruesse\nElias Stadler`,
    };
  }
  if (kind === "follow_up") {
    if (smb) {
      return {
        subject: `${company}: kurze Nachfrage zum Wissens-Thema`,
        body:
          `${hi},\n\n` +
          `kurz nachgehakt: Wahrscheinlich ging meine letzte Mail im Tagesgeschaeft unter.\n\n` +
          `Das Muster, das wir sehen: Betriebe denken erst "wir brauchen mehr Doku" – am Ende ist der Hebel aber, dass Wissen direkt im Alltag entsteht, ohne dass jemand abends Ordner pflegt.\n\n` +
          `Passt diese Woche ein 15-Minuten-Slot fuer eine kompakte Demo zugeschnitten auf ${company}?\n\n` +
          `Viele Gruesse\nElias Stadler`,
      };
    }
    return {
      subject: `${locationLabel}: Standortvergleich oder einzelner Werk-Pilot?`,
      body:
        `${hi},\n\n` +
        `kurz nachgehakt — vermutlich war meine erste Mail nicht der Top-Punkt diese Woche.\n\n` +
        `Was wir bei vergleichbaren Konzernen sehen: Der teuerste Wissensverlust passiert nicht an der Maschine, sondern beim Standortvergleich. Werk A loest ein Problem, Werk B steht 6 Monate spaeter vor demselben Problem ohne Bezug zur Loesung.\n\n` +
        `Macht eine Demo entlang Ihrer Standorte ${locationLabel} Sinn — oder lieber zuerst ein Pilot an einem einzelnen Werk?\n\n` +
        `Viele Gruesse\nElias Stadler`,
    };
  }
  if (smb) {
    return {
      subject: `${company}: Wo wuerden Web/Voice-Agenten am meisten helfen?`,
      body:
        `${hi},\n\n` +
        `eine konkrete Fachfrage, bevor wir ueber Produkte reden: Welche wiederkehrende Kundenfrage oder interne Rueckfrage wuerden Sie als Erstes durch einen Web- oder Voice-Agenten abfangen wollen — und was hindert Sie heute daran?\n\n` +
        `Eine kurze Antwort reicht; ich melde mich mit einer passenden Empfehlung fuer ${company}.\n\n` +
        `Viele Gruesse\nElias Stadler`,
    };
  }
  return {
    subject: `Demo ${locationLabel}: Manager- & Werker-Sicht`,
    body:
      `${hi},\n\n` +
      `wie besprochen: zwei Direkt-Einstiege in eine vorbereitete Demo zu ${locationLabel}.\n\n` +
      `Der Konzern-Link fuehrt ins Manager-Dashboard (KPIs, Standorte, Maschinen). Der Mitarbeiter-Link zeigt die Werker-Sicht direkt an der Maschine, wo Wissen sekundenschnell festgehalten wird.\n\n` +
      `Wenn Sie nach dem Reinschauen 15 Minuten haben, gehe ich gerne mit Ihnen die naechsten Schritte fuer ${locationLabel} durch.\n\n` +
      `Viele Gruesse\nElias Stadler`,
  };
}

/**
 * System-Prompt-Bausteine — getrennt aufgebaut, damit kein 5-Zeilen-String-
 * Monstrum entsteht. Schreibstil: konkret, kurz, eine Hypothese, konkrete
 * naechste Frage. Kein "wertvoller Mehrwert"-Bullshit.
 */
function buildSystemPrompt(
  segment: "enterprise" | "smb",
  kind: MessageKind,
  hasManager: boolean,
  hasResearch: boolean,
): string {
  const baseTone =
    "Du schreibst auf Deutsch im Ton von Elias Stadler (Founder/CEO AxonCore): direkt, konkret, ohne Floskeln. " +
    "Keine Buzzwords ('innovativ', 'synergistisch', 'Mehrwert', 'wertvoll', 'optimieren'). " +
    "Keine Markdown, keine technischen IDs/Slugs/UUIDs, keine Demo-/Test-Wortspiele in der finalen Mail. " +
    "Body als Plaintext mit Absaetzen. Maximal 1 konkrete Frage am Ende.";

  const lengthRule =
    segment === "smb"
      ? " Laenge: 70-110 Woerter. Maximal 4 Absaetze."
      : " Laenge: 90-140 Woerter. Maximal 4 Absaetze.";

  const personalizationRule = hasManager
    ? " Empfaenger ist namentlich bekannt (UWG §7 B2B-konform): persoenliche, sachliche Anrede. " +
      "Greife Position/Standort/LinkedIn-Kontext im Opener auf, ohne Namens-Dropping-Floskeln."
    : " Empfaenger ist nicht namentlich bekannt: nutze 'Hallo' als Opener.";

  const researchRule = hasResearch
    ? " Research-Kontext liegt vor: nutze EINE konkrete Beobachtung (z.B. Tech-Stack, Standort-Skalierung, Headcount-Wachstum, Branche-spezifischer Pain-Point) im Opener. " +
      "Kein generisches 'wir haben gehoert dass...'. Eher hypothesengetrieben: 'Bei Industrieunternehmen mit X sehen wir oft Y - wie ist das bei euch?'"
    : " Kein Research-Kontext vorhanden: nutze eine plausible, branchen-spezifische Hypothese (Knowledge-Drain, Fluktuation, Standort-Skalierung) als Hook.";

  const segmentRule =
    segment === "enterprise"
      ? " Empfaenger ist Werkleiter/Standortleiter/Plant Manager an einem Konzernstandort. " +
        "Konkret: Industrie-Produktion, mehrere Standorte, Knowledge-Drain durch Fluktuation. " +
        "Sprache: gehoben, aber nicht abgehoben. Zahlen und Standortbezug erwuenscht, KEIN Konzern-Jargon."
      : " Empfaenger ist Geschaeftsfuehrer/Inhaber eines KMU. Sprache: bodenstaendig, ohne Konzern-Jargon. " +
        "Fokus: Alltag im Betrieb, geringe Reibung fuer Teams, kein 'noch ein Tool fuer die IT-Schublade'.";

  const kindRule =
    kind === "mail_1"
      ? " Stufe: Erstkontakt. Ziel: kurzer Hook (1 Beobachtung/Hypothese) + 1 Satz, was AxonCore loest + 15-Min-Frage."
      : kind === "follow_up"
        ? " Stufe: Follow-Up nach 2 Tagen ohne Antwort. Ziel: NEUER Aspekt (nicht Wiederholung von Mail 1), eine zugespitzte Hypothese + 15-Min-Frage. " +
          "Schliesse NICHT mit 'falls kein Interesse, dann sage Bescheid'. Stattdessen konkrete Frage zur Naechsten Stufe."
        : segment === "enterprise"
          ? " Stufe: Demo-Einladung Enterprise. Im Anschluss an deinen Body werden ZWEI Demo-Links angehaengt (Konzern-Dashboard und Mitarbeiter-App). " +
            "Fuehre die zwei Sichten im Body ein, schreibe selbst KEINE Links/URLs/Platzhalter."
          : " Stufe: Beratungsfrage SMB (KEINE Demo-Einladung, KEIN Demo-Link). " +
            "Stattdessen praezise Frage zu Web-Agenten und Voice-Agenten im Betrieb.";

  const subjectRule =
    " WICHTIG zur Betreffzeile: KEINE Floskeln wie 'Kurze Frage' oder 'Wissenssicherung'. " +
    "Eher: konkret, neugierig-machend, max 60 Zeichen. Idealerweise mit dem Firmen- oder Standortnamen. " +
    "Vermeide Spam-Trigger ('!!', 'gratis', 'jetzt'). " +
    "Generiere ZWEI Subject-Line-Varianten — eine direkte Frage und eine konkrete Beobachtung.";

  const outputFormat =
    " Gib STRIKT JSON zurueck (kein Markdown, keine Backticks, kein Prefix-Text):\n" +
    "{\n" +
    '  "subject_a": "Direkte Frage-Variante",\n' +
    '  "subject_b": "Beobachtungs-Variante",\n' +
    '  "body": "Kompletter Mail-Body inklusive Anrede und Signatur"\n' +
    "}";

  return baseTone + lengthRule + personalizationRule + researchRule + segmentRule + kindRule + subjectRule + outputFormat;
}

function pickSubjectVariant(a: string, b: string): string {
  // 50/50-Split. Random ist gut genug; wir tracken Reply-Rates separat
  // ueber message_type / metadata fuer A/B-Auswertung.
  return Math.random() < 0.5 ? a : b;
}

export async function generateOutreachMessage(input: {
  kind: MessageKind;
  lead: LeadInput;
}): Promise<{ subject: string; body: string; model: string | null }> {
  const openai = tryGetOpenAi();
  if (!openai) {
    const d = defaultMessage(input.kind, input.lead);
    return { ...d, model: null };
  }

  const model = (sanitizeEnv(process.env.OPENAI_GPT_MODEL) ?? "").trim() || "gpt-4.1";
  const segment = input.lead.lead_segment === "smb" ? "smb" : "enterprise";
  const hasManager =
    typeof input.lead.manager_name === "string" && input.lead.manager_name.trim().length > 0;
  const research = compactResearch(input.lead);

  const system = buildSystemPrompt(segment, input.kind, hasManager, !!research);

  const facts = compactCompanyFacts(input.lead);
  const user = [
    `Lead-Profil (${segment === "smb" ? "KMU/Kleinunternehmen" : "Konzernstandort/Enterprise"}):`,
    `Firma: ${input.lead.company_name}`,
    facts ? facts : null,
    research ? `\nResearch:\n${research}` : null,
    `\nMessage-Typ: ${input.kind}`,
    segment === "smb" && input.kind === "demo"
      ? "\n(Spezial-Anweisung: Beratungsfrage zu Web-/Voice-Agenten — KEINE Demo, KEIN Link.)"
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.45,
      max_tokens: 520,
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      subject_a?: unknown;
      subject_b?: unknown;
      subject?: unknown;
      body?: unknown;
    };

    const subjectA =
      typeof parsed.subject_a === "string" && parsed.subject_a.trim().length > 0
        ? parsed.subject_a.trim()
        : typeof parsed.subject === "string"
          ? parsed.subject.trim()
          : "";
    const subjectB =
      typeof parsed.subject_b === "string" && parsed.subject_b.trim().length > 0
        ? parsed.subject_b.trim()
        : subjectA;
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";

    if (!subjectA || !body) {
      const d = defaultMessage(input.kind, input.lead);
      return { ...d, model };
    }
    const picked = pickSubjectVariant(subjectA, subjectB);
    return {
      subject: picked.slice(0, 200),
      body: body.slice(0, 6000),
      model,
    };
  } catch {
    const d = defaultMessage(input.kind, input.lead);
    return { ...d, model };
  }
}
