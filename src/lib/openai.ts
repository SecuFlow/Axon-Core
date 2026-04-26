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

export type WorkerAiAnalysis = {
  priority_level: AiPriorityLevel;
  analysis_text: string;
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

export function resolveSerialForInventory(input: {
  gptSerial: string | null | undefined;
  machineLabel: string | null | undefined;
  transcriptText: string;
}): string | null {
  const fromGpt = input.gptSerial?.trim();
  if (fromGpt) return fromGpt.slice(0, 120);

  const label = input.machineLabel?.trim() ?? "";
  const mLabel = label.match(
    /\b([A-Z]{2,8}[-_/]?\d{3,}|\d{6,}|[A-Z]-\d{4,})\b/,
  );
  if (mLabel) return mLabel[1].slice(0, 120);

  const t = input.transcriptText;
  const mSn = t.match(
    /\b(?:SN|Seriennummer|S\/N|Nr\.?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9/-]{3,})\b/i,
  );
  if (mSn) return mSn[1].slice(0, 120);

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

export async function analyzeWorkerInputWithGpt(input: {
  transcriptText: string;
  photoDataUrls: string[];
}): Promise<WorkerAiAnalysis> {
  const openai = getOpenAiClient();
  const model = process.env.OPENAI_GPT_MODEL?.trim() || "gpt-4o";

  const systemPrompt =
    "Du bist ein Assistent fuer technische Analysen in einer Fertigungsumgebung. Du bekommst ggf. ein Whisper-Transkript und ein/mehrere Fotos. " +
    "WICHTIG: Analysiere ausschliesslich den tatsaechlichen Meldungsinhalt (Transkript und Bilder). " +
    "Verwende KEINE Platzhalter, keinen Test- oder Demo-Modus, keine erfundenen 'Testwoerter' oder Beispieltexte — die Ausgabe muss sich direkt auf die gemeldete Stoerung beziehen. " +
    "Erstelle eine strukturierte Antwort in strikt gueltigem JSON. " +
    "Prioritaet ist eine Zahl von 1 bis 3 (1=hoch, 2=mittel, 3=niedrig). " +
    "Gib eine kurze Analyse (analysis_text) und eine Liste konkreter Loesungsschritte (solution_steps) auf Deutsch. " +
    "Pruefe: Wird eine Seriennummer ODER ein Maschinenname/Typ genannt? -> machine_identifier_present. " +
    "Ist das Problem/Fehler klar beschrieben? -> problem_clearly_described. " +
    "Ist der Defekt aus Sprache und Bildern nachvollziehbar? Wenn keine Fotos oder Defekt unklar -> defect_clear_from_media false. " +
    "machine_status_hint: active (Anlage laeuft/wieder ok), maintenance (Wartung, Stillstand, warten), offline (Abschalten, Not-Aus), oder null wenn nicht erkennbar. " +
    "extracted_machine_label: kurzer Maschinenname/Typ aus dem Text oder null. " +
    "extracted_serial_number: nur die Seriennummer/Kennung fuer Inventar, oder null.";

  const userText = `Eingangsdaten (kann unvollstaendig sein):

Transkript:
${input.transcriptText || "(leer)"}

Bitte liefere strikt JSON mit den Feldern:
{
  "priority_level": 1 | 2 | 3,
  "analysis_text": string,
  "solution_steps": string[],
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

    const machine_status = mergeMachineStatus(
      input.transcriptText,
      hint,
    );

    const {
      machine_status_hint: _drop,
      extracted_machine_label: _l,
      extracted_serial_number: _s,
      ...rest
    } = parsed;

    return {
      ...rest,
      extracted_machine_label,
      extracted_serial_number,
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
