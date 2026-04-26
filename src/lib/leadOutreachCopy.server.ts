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

function salutation(lead: LeadInput): string {
  const name = typeof lead.manager_name === "string" ? lead.manager_name.trim() : "";
  if (!name) return "Guten Tag";
  // "Herr/Frau X" -> behalten; sonst Standard + vollständiger Name
  if (/^(Herr|Frau)\s+/i.test(name)) return `Sehr geehrte/r ${name}`;
  return `Sehr geehrte/r ${name}`;
}

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

function compactCompanyFacts(lead: LeadInput): string {
  const parts = [
    lead.corporate_group_name ? `Konzern: ${lead.corporate_group_name}` : null,
    lead.location_name ? `Standort: ${lead.location_name}` : null,
    lead.manager_name ? `Manager: ${lead.manager_name}` : null,
    lead.department ? `Abteilung: ${lead.department}` : null,
    lead.linkedin_url ? `LinkedIn: ${lead.linkedin_url}` : null,
    lead.domain ? `Domain: ${lead.domain}` : null,
    lead.industry ? `Branche: ${lead.industry}` : null,
    lead.market_segment ? `Segment: ${lead.market_segment}` : null,
    typeof lead.employee_count === "number"
      ? `Mitarbeiter: ${lead.employee_count}`
      : null,
    typeof lead.revenue_eur === "number" ? `Umsatz EUR/Jahr: ${lead.revenue_eur}` : null,
    lead.hq_location ? `HQ: ${lead.hq_location}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function compactResearch(lead: LeadInput): string | null {
  const rc = typeof lead.research_context === "string" ? lead.research_context.trim() : "";
  if (!rc) return null;
  // Hartes Limit: Prompt klein halten, aber nützlich.
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
        subject: `Kurz & konkret: digitales Betriebsgedächtnis für ${locationLabel}`,
        body:
          `${hi},\n\n` +
          `in vielen KMU‑Betrieben geht Know‑how mit den Leuten verloren – nicht weil es fehlt, sondern weil es nirgends sauber gebündelt ist.\n\n` +
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
        `Wenn das Thema bei ${locationLabel} relevant ist: Soll ich Ihnen eine präzise 15‑Min‑Demo entlang Ihrer Standort‑ und Maschinenstruktur vorbereiten?\n\n` +
        `Viele Grüße\nElias Stadler`,
    };
  }
  if (kind === "follow_up") {
    if (smb) {
      return {
        subject: `Follow‑Up: Wissen im Betrieb sichern (${locationLabel})`,
        body:
          `${hi},\n\n` +
          `kurz nachgehakt: Viele Betriebe starten mit „mehr Dokumentation“ – der Hebel ist aber oft, Wissen dort zu sichern, wo die Arbeit passiert.\n\n` +
          `AxonCore ist darauf ausgelegt, dass Teams im Alltag mitziehen – nicht noch ein Tool für die IT-Schublade.\n\n` +
          `Passt ein kurzes Fenster diese Woche für eine kompakte Demo mit Bezug zu ${company}?\n\n` +
          `Viele Grüße\nElias Stadler`,
      };
    }
    return {
      subject: `Follow‑Up: Wissenssicherung & Standort‑Skalierung (${locationLabel})`,
      body:
        `${hi},\n\n` +
        `kurz nachgehakt: Das Risiko ist selten „fehlende Dokumentation“, sondern der Verlust von implizitem Fachwissen – genau dort, wo es teuer wird.\n\n` +
        `AxonCore sichert Wissen pro Standort/Maschine und macht es auditierbar – ohne dass Ihre Teams zusätzliche Administration spüren.\n\n` +
        `Passt ein kurzes Zeitfenster diese Woche, damit ich Ihnen den Ablauf für ${locationLabel} konkret zeige?\n\n` +
        `Viele Grüße\nElias Stadler`,
    };
  }
  // „demo“-Stufe bei KMU: keine Demo-Einladung — gezielte Beratungsfrage (Web- & Voice-Agenten)
  if (smb) {
    return {
      subject: `Kurze Fachfrage: Web- & Voice-Agenten bei ${locationLabel}`,
      body:
        `${hi},\n\n` +
        `wir sehen bei vielen Betrieben den gleichen Engpass: Wissen sitzt verteilt, und gleichzeitig sollen digitale Kanäle (Website, Telefon/Voice) Antworten liefern — ohne dass jedes Mal alles neu erklärt werden muss.\n\n` +
        `Bevor wir über Produkte oder Demos sprechen, würde mich konkret interessieren:\n` +
        `Welche wiederkehrenden Kundenfragen oder internen Rückfragen würden Sie am liebsten zuerst durch einen Web‑Agenten bzw. Voice‑Agenten abfangen — und was hindert Sie heute daran?\n\n` +
        `Eine kurze Rückmeldung reicht; ich melde mich mit einer passenden Empfehlung.\n\n` +
        `Viele Grüße\nElias Stadler`,
    };
  }
  return {
    subject: `Demo für ${locationLabel} – Manager- & Werker-Sicht`,
    body:
      `${hi},\n\n` +
      `wie besprochen: anbei zwei Direkt‑Einstiege in eine vorbereitete Demo zu ${locationLabel}.\n\n` +
      `Der Konzern‑Link führt in das Manager‑Dashboard mit KPIs, Standortübersicht und Maschinen‑Inventar. Der Mitarbeiter‑Link zeigt die Werker‑Sicht direkt an der Maschine — dort wird Wissen sekundenschnell gesichert.\n\n` +
      `Wenn Sie nach dem Reinschauen 15 Minuten Zeit haben, gehe ich gerne mit Ihnen die nächsten Schritte für ${locationLabel} durch.\n\n` +
      `Viele Grüße\nElias Stadler`,
  };
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

  const model = (sanitizeEnv(process.env.OPENAI_GPT_MODEL) ?? "").trim() || "gpt-4o";
  const smb = input.lead.lead_segment === "smb";
  const hasManager =
    typeof input.lead.manager_name === "string" && input.lead.manager_name.trim().length > 0;
  const personalizationHint = hasManager
    ? " Der Empfänger ist ein konkreter Entscheider (Name liegt vor); nutze eine persönliche, sachliche Anrede (z. B. „Sehr geehrte/r <Name>“). Greife – wo sinnvoll – Standort, Abteilung oder LinkedIn-Kontext dezent auf (nicht aufdringlich, keine Namensdropping-Floskeln)."
    : "";
  const system =
    smb && input.kind === "demo"
      ? "Du schreibst eine E-Mail an ein Kleinunternehmen / KMU in deutscher Sprache im Ton von Elias Stadler (Founder/CEO): wertschätzend, klar, pragmatisch. " +
        "Wichtig: KEINE Demo-Einladung, KEIN Demo-Link, kein „wir zeigen Ihnen das Produkt“. Stattdessen eine präzise Beratungsfrage zu Web-Agenten und Voice-Agenten im Betrieb (Website, Telefon/IVR). " +
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
      (input.kind === "demo"
        ? " WICHTIG: Im Anschluss an Deinen Body werden automatisch zwei Demo-Links angehängt — einer für das Konzern-Dashboard (Manager-Sicht: KPIs, Standorte, Maschinen) und einer für die Mitarbeiter-App (Werker-Sicht direkt an der Maschine). Führe diese beiden Sichten im Body inhaltlich ein, ABER schreibe selbst KEINE Links, KEINE URLs und KEINE Platzhalter — diese werden technisch ergänzt."
        : "") +
      personalizationHint;

  const user =
    `Lead (${smb ? "KMU / Kleinunternehmen" : "Enterprise-Konzernstandort"}):\n` +
    `Firma/Anzeigename: ${input.lead.company_name}\n` +
    `${compactCompanyFacts(input.lead)}\n\n` +
    `${compactResearch(input.lead) ? `${compactResearch(input.lead)}\n\n` : ""}` +
    `Message-Typ: ${input.kind}\n` +
    (smb && input.kind === "demo"
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
    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    const subject = typeof parsed.subject === "string" ? parsed.subject.trim() : "";
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!subject || !body) {
      const d = defaultMessage(input.kind, input.lead);
      return { ...d, model };
    }
    return { subject: subject.slice(0, 200), body: body.slice(0, 6000), model };
  } catch {
    const d = defaultMessage(input.kind, input.lead);
    return { ...d, model };
  }
}

