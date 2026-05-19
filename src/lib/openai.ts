import OpenAI from "openai";
import { deriveMachineStatusFromTranscript as deriveMachineStatusFromNlp } from "./machineStatusNlp";

export {
  mapNlpKeywordsToMachineStatus,
  deriveMachineStatusFromTranscript,
} from "./machineStatusNlp";

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY fehlt. Bitte die Umgebungsvariable in .env.local setzen.",
    );
  }
  return new OpenAI({ apiKey });
}

export async function transcribeAudio(audioFile: File): Promise<string> {
  try {
    const openai = getOpenAiClient();
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "de",
      response_format: "json",
    });

    const text = transcription.text?.trim();
    if (!text) {
      return "";
    }

    return text;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Whisper-API nicht erreichbar oder Fehler bei der Transkription: ${error.message}`,
      );
    }
    throw new Error(
      "Whisper-API nicht erreichbar oder unbekannter Transkriptionsfehler.",
    );
  }
}

export type AiPriority = "Hoch" | "Mittel" | "Niedrig";

export type AiPriorityLevel = 1 | 2 | 3;

/** Betriebszustand aus Sprachsignalen (z. B. Abschalten, Warten, wieder Inbetriebnahme). */
export type MachineStatus = "active" | "maintenance" | "offline";

/** Liste bekannter Maschinen des Mandanten, damit GPT „S01" o.ä. matchen kann. */
export type ExistingMachineHint = {
  /** Maschinen-Name in der DB (wird bevorzugt zurückgegeben, wenn ein Match passt). */
  name: string | null;
  /** Serial in der DB (Inventar-Key). */
  serial: string | null;
  /** Letzter bekannter Betriebsstatus (active/maintenance/offline). */
  status?: string | null;
};

export type WorkerAiAnalysis = {
  priority_level: AiPriorityLevel;
  /**
   * Mehrere Sätze: konkrete Fehlerhypothese (mit wahrscheinlichster Ursache),
   * Risiko/Folgeschaden, Bezug zu Bild und Spracheingabe.
   */
  analysis_text: string;
  /** 3–7 konkrete, ausführbare Wartungsschritte in der richtigen Reihenfolge. */
  solution_steps: string[];
  /** Seriennummer, Typbezeichnung oder eindeutiger Maschinenname erkennbar. */
  machine_identifier_present: boolean;
  /** Problem/Fehler ausreichend beschrieben. */
  problem_clearly_described: boolean;
  /** Defekt aus Ton+Text+Bildern nachvollziehbar; false = zusaetzliches Bild sinnvoll. */
  defect_clear_from_media: boolean;
  /** Optional extrahierte Bezeichnung/Seriennummer fuer Speicherung. */
  extracted_machine_label: string | null;
  /** Explizite Seriennummer falls erkennbar (Inventar-Upsert). */
  extracted_serial_number: string | null;
  /** Gemergter Status aus Transkript-Phrasen und Modell-Hint. */
  machine_status: MachineStatus | null;
  /**
   * Konkrete Ersatzteil-/Komponenten-Empfehlung als Klartext, z. B.
   * „Vermutlich Spindellager (z. B. NSK 6205-2RS) — bitte vor Demontage Schwingungsmessung".
   * `null`, wenn aus der Meldung kein Teil ableitbar ist.
   */
  required_part: string | null;
  /**
   * Optionale Sicherheits-/Stopp-Hinweise. Leer-Array wenn nichts kritisch ist.
   * Beispiel: „Maschine sofort spannungsfrei schalten (Not-Aus + LOTO)".
   */
  safety_notes: string[];
};

export const VOICE_PROMPT_MACHINE =
  "Um welche Maschine handelt es sich genau?";
export const VOICE_PROMPT_PROBLEM =
  "Bitte beschreibe den Fehler genauer.";
export const VOICE_PROMPT_PHOTO =
  "Mache bitte noch ein zusätzliches Bild von oben/unten.";

export function buildVoicePrompts(analysis: Pick<
  WorkerAiAnalysis,
  "machine_identifier_present" | "problem_clearly_described" | "defect_clear_from_media"
>): string[] {
  const out: string[] = [];
  if (!analysis.machine_identifier_present) out.push(VOICE_PROMPT_MACHINE);
  if (!analysis.problem_clearly_described) out.push(VOICE_PROMPT_PROBLEM);
  if (!analysis.defect_clear_from_media) out.push(VOICE_PROMPT_PHOTO);
  return out;
}

/**
 * Sprachausgabe: Prompts plus KI-Anweisungen (Bitte…, Foto…, etc.).
 */
export function collectInstructionUtterances(input: {
  voicePrompts: string[];
  analysisText: string;
  solutionSteps: string[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const v of input.voicePrompts) push(v);

  const imperative =
    /\b(bitte|mach(e)?|nehmen\s+sie|foto|fotograf|aufnahme|drücken|schalten|warten|prüfen|sicher(stellen)?|dokumentier)/i;

  for (const step of input.solutionSteps) {
    if (imperative.test(step)) push(step);
  }

  const sentences = input.analysisText
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  for (const s of sentences) {
    if (s.length > 12 && imperative.test(s)) push(s);
  }

  return out;
}

/**
 * Normalisiert beliebige Bezeichnungen zu einem stabilen Inventar-Key.
 * „CNC Linie 3" → „cnc-linie-3", „S 01" → „s01", „Press 1A" → „press-1a".
 *
 * Wir nutzen das als LAST-RESORT, wenn GPT keine Seriennummer und auch kein
 * Pattern matcht, der Werker aber eine Bezeichnung ausgesprochen hat.
 */
function slugifyLabelForInventory(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Findet einen Inventar-Key für die Maschine. Reihenfolge:
 *   1) Was GPT als Seriennummer geliefert hat.
 *   2) Pattern im Label/Transkript (z. B. „S01", „CNC-123", „Press 1A").
 *   3) Klassischer „SN: …"-Pattern im Fließtext.
 *   4) **Neu:** Slug des Maschinen-Labels (z. B. „CNC Linie 3" → „cnc-linie-3"),
 *      damit das Inventar auch dann gefüllt wird, wenn keine Seriennummer
 *      ausgesprochen wurde — nur dann wird gar nichts zurückgegeben, wenn
 *      auch kein Label vorhanden ist.
 */
export function resolveSerialForInventory(input: {
  gptSerial: string | null | undefined;
  machineLabel: string | null | undefined;
  transcriptText: string;
}): string | null {
  const fromGpt = input.gptSerial?.trim();
  if (fromGpt) return fromGpt.slice(0, 120);

  const label = input.machineLabel?.trim() ?? "";

  // 2a) Strenges Industrie-Serial-Pattern (ABC-001, CNC123, ROB-9999, A-1234).
  const mStrict = label.match(
    /\b([A-Z]{2,8}[-_/]?\d{3,}|\d{6,}|[A-Z]-\d{4,})\b/,
  );
  if (mStrict) return mStrict[1].slice(0, 120);

  // 2b) Lockeres Pattern für typische Linien-/Anlagen-Bezeichnungen aus dem
  //     Werker-Sprachgebrauch („S01", „A12", „F1", „CNC3", „Press1A").
  //     1+ Großbuchstabe + 1+ Ziffer + optional 1 weiterer Buchstabe.
  const mLoose = label.match(/\b([A-Z]{1,6}[-_/]?\d{1,6}[A-Z]?)\b/);
  if (mLoose) return mLoose[1].slice(0, 120);

  // 3) Klassischer „SN: …"-Pattern.
  const t = input.transcriptText;
  const mSn = t.match(
    /\b(?:SN|Seriennummer|S\/N|Nr\.?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9/-]{3,})\b/i,
  );
  if (mSn) return mSn[1].slice(0, 120);

  // 3b) Lockeres Pattern direkt im Transkript (Werker sagt „die S01 macht…").
  const mLooseT = t.match(/\b([A-Z]{1,6}[-_/]?\d{1,6}[A-Z]?)\b/);
  if (mLooseT) return mLooseT[1].slice(0, 120);

  // 4) Last-Resort: Slug aus dem (ggf. mehrwortigen) Maschinen-Label, damit
  //    auch „CNC Linie 3" / „Hydraulikpresse Halle B" als Inventar-Eintrag
  //    landet. Mindestens 2 Zeichen, sonst ist das kein sinnvoller Key.
  if (label) {
    const slug = slugifyLabelForInventory(label);
    if (slug.length >= 2) return slug;
  }

  return null;
}

function mergeMachineStatus(
  transcriptText: string,
  hint: MachineStatus | null,
): MachineStatus | null {
  const fromPhrase = deriveMachineStatusFromNlp(transcriptText);
  if (fromPhrase) return fromPhrase;
  return hint ?? null;
}

type WorkerAiAnalysisParsed = Omit<WorkerAiAnalysis, "machine_status"> & {
  machine_status_hint: MachineStatus | null;
};

function buildExistingMachinesBlock(
  hints: ExistingMachineHint[] | null | undefined,
): string {
  if (!Array.isArray(hints) || hints.length === 0) {
    return "(keine bekannten Maschinen im Inventar des Mandanten)";
  }
  const lines = hints.slice(0, 40).map((h) => {
    const name = (h.name ?? "").trim();
    const serial = (h.serial ?? "").trim();
    const status = (h.status ?? "").trim();
    const parts: string[] = [];
    if (name) parts.push(`name="${name}"`);
    if (serial) parts.push(`serial="${serial}"`);
    if (status) parts.push(`status=${status}`);
    return `- ${parts.join(" | ") || "(unbekannt)"}`;
  });
  return lines.join("\n");
}

export async function analyzeWorkerInputWithGpt(input: {
  transcriptText: string;
  photoDataUrls: string[];
  existingMachines?: ExistingMachineHint[];
}): Promise<WorkerAiAnalysis> {
  const openai = getOpenAiClient();
  const model = process.env.OPENAI_GPT_MODEL?.trim() || "gpt-4o";

  const systemPrompt = `Du bist Senior-Wartungsingenieur mit 15 Jahren Erfahrung in Industrieanlagen (CNC, Pressen, Roboter, Förderer, Hydraulik, Pneumatik, E-Antriebe). Aufgabe: Aus einem Whisper-Transkript eines Werkers + ggf. Foto(s) erstellst du eine strikt valide JSON-Antwort mit präziser technischer Analyse.

REGELN:
1) Analysiere AUSSCHLIESSLICH die gemeldete Störung. Keine Test-/Demo-Phrasen, keine erfundenen Beispiele, keine Platzhalter wie "XY könnte ein Problem sein".
2) analysis_text muss 3–6 vollständige Sätze umfassen mit:
   • der wahrscheinlichsten Ursache (technisch konkret, keine Floskeln),
   • optional 1–2 plausiblen Alternativ-Ursachen (mit "bzw." / "oder"),
   • Hinweis auf Folgeschäden bei Nichtbehandlung,
   • einer Empfehlung, ob die Anlage weiterbetrieben werden darf.
3) solution_steps enthält 3–7 konkrete, ausführbare Schritte in technisch sinnvoller Reihenfolge. Jeder Schritt fängt mit einem Verb an (z. B. "Spindel auf Lagerschaden prüfen..."). KEINE Floskeln wie "Anlage überprüfen".
4) required_part ist DIE wahrscheinlichste Komponente bzw. ein konkreter Ersatzteil-Hinweis als deutscher Klartext, idealerweise mit Typ/Norm/Beispiel (z. B. "Spindellager NSK 6205-2RS oder vergleichbar"). Wenn aus der Meldung kein Teil ableitbar ist, gib null zurück.
5) safety_notes listet harte Sicherheits-/Stopp-Hinweise — z. B. "Sofort Not-Aus + LOTO" bei Risiko für Mensch/Maschine. Leeres Array, wenn nichts kritisch ist.
6) priority_level: 1=hoch (Personenrisiko, drohender Totalausfall, Brand-, Hydraulik-, E-Risiko), 2=mittel (Funktionsstörung, Folgeschaden droht), 3=niedrig (kosmetisch, planbare Wartung).
7) machine_status_hint: 'offline' bei Not-Aus/Abschalten/Spannungsfrei, 'maintenance' bei Wartung/Stillstand/Pause, 'active' wenn die Anlage wieder normal läuft, oder null falls nicht erkennbar.
8) MASCHINEN-MATCH: Wenn der Werker eine Bezeichnung wie "S01" / "CNC Linie 3" / "Press 1A" o.ä. ausspricht, MATCHE es zwingend gegen die unten aufgelistete bekannte Maschinenliste (case- und spaces-insensitiv). Setze dann:
     extracted_machine_label = name aus dem Match,
     extracted_serial_number = serial aus dem Match.
   Falls KEIN Match existiert, aber eine eindeutige Bezeichnung im Text vorkommt: setze extracted_machine_label = die genannte Bezeichnung, und extracted_serial_number = dieselbe Bezeichnung, FALLS sie wie eine Seriennummer aussieht (Buchstabe+Zahl, z. B. "S01"). Beide Felder dürfen NICHT gleichzeitig null sein, solange irgendeine Bezeichnung im Text vorkam.`;

  const existingBlock = buildExistingMachinesBlock(input.existingMachines);

  const userText = `Eingangsdaten (kann unvollständig sein):

Bekannte Maschinen im Inventar des Mandanten (Reihenfolge nach Häufigkeit):
${existingBlock}

Transkript:
${input.transcriptText || "(leer)"}

Bitte liefere strikt JSON mit den Feldern:
{
  "priority_level": 1 | 2 | 3,
  "analysis_text": string,
  "solution_steps": string[],
  "required_part": string | null,
  "safety_notes": string[],
  "machine_identifier_present": boolean,
  "problem_clearly_described": boolean,
  "defect_clear_from_media": boolean,
  "extracted_machine_label": string | null,
  "extracted_serial_number": string | null,
  "machine_status_hint": "active" | "maintenance" | "offline" | null
}`;

  try {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "text", text: userText },
    ];

    for (const url of input.photoDataUrls.slice(0, 3)) {
      if (typeof url === "string" && url.startsWith("data:")) {
        content.push({ type: "image_url", image_url: { url } });
      }
    }

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      // Erzwingt JSON-Ausgabe (OpenAI JSON mode)
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as WorkerAiAnalysisParsed;

    // Minimaler Validierungscheck
    const pri = parsed.priority_level;
    if (pri !== 1 && pri !== 2 && pri !== 3) {
      throw new Error("Ungültige priority vom GPT Modell.");
    }

    if (!Array.isArray(parsed.solution_steps)) {
      throw new Error("Ungültige solution_steps vom GPT Modell.");
    }

    const hint = parsed.machine_status_hint;
    if (
      hint !== null &&
      hint !== "active" &&
      hint !== "maintenance" &&
      hint !== "offline"
    ) {
      throw new Error("Ungueltiges machine_status_hint vom GPT Modell.");
    }

    for (const key of [
      "machine_identifier_present",
      "problem_clearly_described",
      "defect_clear_from_media",
    ] as const) {
      if (typeof parsed[key] !== "boolean") {
        throw new Error(`Ungueltiges ${key} vom GPT Modell.`);
      }
    }

    const labelRaw = parsed.extracted_machine_label;
    const extracted_machine_label =
      labelRaw === undefined || labelRaw === null
        ? null
        : typeof labelRaw === "string"
          ? labelRaw
          : null;
    if (labelRaw !== undefined && labelRaw !== null && typeof labelRaw !== "string") {
      throw new Error("Ungueltiges extracted_machine_label vom GPT Modell.");
    }

    const serialRaw = parsed.extracted_serial_number;
    const extracted_serial_number =
      serialRaw === undefined || serialRaw === null
        ? null
        : typeof serialRaw === "string"
          ? serialRaw
          : null;
    if (
      serialRaw !== undefined &&
      serialRaw !== null &&
      typeof serialRaw !== "string"
    ) {
      throw new Error("Ungueltiges extracted_serial_number vom GPT Modell.");
    }

    // required_part: string | null — toleranter Parser, da das Feld neu ist und
    // ältere Prompts es noch nicht zuverlässig liefern.
    const partRaw = (parsed as { required_part?: unknown }).required_part;
    let required_part: string | null = null;
    if (typeof partRaw === "string") {
      const trimmed = partRaw.trim();
      if (trimmed.length > 0 && trimmed.toLowerCase() !== "null") {
        required_part = trimmed.slice(0, 500);
      }
    } else if (Array.isArray(partRaw)) {
      const joined = partRaw
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .join(", ");
      if (joined) required_part = joined.slice(0, 500);
    }

    // safety_notes: string[]
    const safetyRaw = (parsed as { safety_notes?: unknown }).safety_notes;
    const safety_notes = Array.isArray(safetyRaw)
      ? (safetyRaw.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        ) as string[])
      : [];

    const machine_status = mergeMachineStatus(
      input.transcriptText,
      hint,
    );

    const {
      machine_status_hint: _drop,
      extracted_machine_label: _l,
      extracted_serial_number: _s,
      required_part: _rp,
      safety_notes: _sn,
      ...rest
    } = parsed as WorkerAiAnalysisParsed & {
      required_part?: unknown;
      safety_notes?: unknown;
    };

    // Label-/Serial-Fallback: Wenn GPT eines der beiden Felder ausgelassen hat,
    // aber das andere gesetzt ist, leiten wir das fehlende ab. Damit landet
    // „S01" in der UI nie mehr als „Unbekannte Maschine".
    const labelFinal =
      extracted_machine_label ?? extracted_serial_number ?? null;
    const serialFinal =
      extracted_serial_number ??
      (extracted_machine_label &&
      /^[A-Za-z]{1,6}[-_/]?\d{1,8}$/.test(extracted_machine_label.trim())
        ? extracted_machine_label.trim()
        : null);

    return {
      ...rest,
      extracted_machine_label: labelFinal,
      extracted_serial_number: serialFinal,
      required_part,
      safety_notes,
      machine_status,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GPT-Analyse fehlgeschlagen: ${error.message}`);
    }
    throw new Error("GPT-Analyse fehlgeschlagen: unbekannter Fehler.");
  }
}

export async function summarizeMachineDashboard(input: {
  machineName: string;
  serialNumber: string;
  status: string;
  recentCases: Array<{
    created_at: string | null;
    analysis_text: string | null;
    solution_steps: unknown;
  }>;
  recentLogLines: Array<{
    created_at: string | null;
    detail: string | null;
    status_after: string | null;
  }>;
}): Promise<string> {
  const openai = getOpenAiClient();
  const model = process.env.OPENAI_GPT_MODEL?.trim() || "gpt-4o";

  const caseBullets = input.recentCases.slice(0, 5).map((c) => {
    let steps = "";
    if (Array.isArray(c.solution_steps)) {
      steps = (c.solution_steps as string[]).slice(0, 2).join("; ");
    }
    return `- ${c.created_at ?? "?"} Problem: ${(c.analysis_text ?? "").slice(0, 180)} | Massnahmen: ${steps.slice(0, 180)}`;
  });

  const logBullets = input.recentLogLines.slice(0, 6).map(
    (l) =>
      `- ${l.created_at ?? "?"} Status ${l.status_after ?? "—"}: ${(l.detail ?? "").slice(0, 140)}`,
  );

  const userPrompt = `Maschine: ${input.machineName} (SN: ${input.serialNumber}), Betriebsstatus: ${input.status}

Letzte Berichte:
${caseBullets.join("\n") || "(keine)"}

Log-Eintraege:
${logBullets.join("\n") || "(keine)"}

Schreibe EINEN kurzen deutschen Satz (hoechstens 220 Zeichen), sachlich, fuer ein Wartungs-Dashboard. Beispielton: Stabilitaet / letzte Reparatur / naechste sinnvolle Pruefung. Keine Anfuehrungszeichen, kein JSON.`;

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein technischer Assistent. Antworte nur mit genau einem kurzen deutschen Satz, ohne Anfuehrungszeichen.",
      },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.35,
    max_tokens: 120,
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? "";
  return text.slice(0, 400);
}
