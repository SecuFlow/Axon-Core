import OpenAI from "openai";

export const SEQUENTIAL_FIELDS = [
  "machine_name",
  "issue_description",
  "photo",
] as const;

export type SequentialField = (typeof SEQUENTIAL_FIELDS)[number];

export const REPEAT_PROMPT_DE =
  "Das habe ich nicht verstanden, kannst du das bitte wiederholen?";

const QUESTIONS_DE: Record<Exclude<SequentialField, "photo">, string> = {
  machine_name:
    "Wie heißt die Maschine, oder welche Seriennummer hat sie?",
  issue_description:
    "Was ist passiert? Beschreib bitte kurz das Problem oder den Fehler.",
};

export function getQuestionForStep(
  step: Exclude<SequentialField, "photo">,
): string {
  return QUESTIONS_DE[step];
}

export function getPhotoInstructionDe(): string {
  return "Bitte mach jetzt ein Foto von der Maschine oder dem Schaden.";
}

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY fehlt. Bitte die Umgebungsvariable in .env.local setzen.",
    );
  }
  return new OpenAI({ apiKey });
}

export type ValidateVoiceAnswerResult = {
  valid: boolean;
  unclear: boolean;
  normalized: string | null;
};

const KI_VALIDATION_TIMEOUT_MS = 3000;

/**
 * KI-Validierung mit Timeout: nach 3 s wird das Transkript als akzeptiert behandelt (weiter zum nächsten Schritt).
 * Bei Fehler der KI-API ebenfalls Fallback auf das Roh-Transkript.
 */
export async function validateVoiceAnswerForFieldWithTimeout(
  field: Exclude<SequentialField, "photo">,
  transcriptRaw: string,
  timeoutMs: number = KI_VALIDATION_TIMEOUT_MS,
): Promise<{ validation: ValidateVoiceAnswerResult; timedOut: boolean }> {
  const transcript = transcriptRaw.trim();
  if (!transcript || transcript.length < 2) {
    return {
      validation: { valid: false, unclear: true, normalized: null },
      timedOut: false,
    };
  }

  const fallback: ValidateVoiceAnswerResult = {
    valid: true,
    unclear: false,
    normalized: transcript.slice(0, 200),
  };

  let finished = false;
  return await new Promise((resolve) => {
    const t = setTimeout(() => {
      if (finished) return;
      finished = true;
      resolve({ validation: fallback, timedOut: true });
    }, timeoutMs);

    validateVoiceAnswerForField(field, transcriptRaw)
      .then((validation) => {
        if (finished) return;
        finished = true;
        clearTimeout(t);
        resolve({ validation, timedOut: false });
      })
      .catch(() => {
        if (finished) return;
        finished = true;
        clearTimeout(t);
        resolve({ validation: fallback, timedOut: true });
      });
  });
}

/**
 * Validiert genau ein Pflichtfeld (Maschinenbezug oder Fehlerbeschreibung).
 */

export async function validateVoiceAnswerForField(
  field: Exclude<SequentialField, "photo">,
  transcriptRaw: string,
): Promise<ValidateVoiceAnswerResult> {
  const transcript = transcriptRaw.trim();
  if (!transcript || transcript.length < 2) {
    return { valid: false, unclear: true, normalized: null };
  }

  const openai = getOpenAiClient();
  const model = process.env.OPENAI_GPT_MODEL?.trim() || "gpt-4o";

  const fieldHint =
    field === "machine_name"
      ? "Erwartet wird ein Maschinenname, Anlagencode oder eine Seriennummer (mindestens erkennbar)."
      : "Erwartet wird eine sinnvolle Fehler- oder Störungsbeschreibung (nicht nur Geräusche oder Ein-Wort-Antworten ohne Kontext).";

  const system =
    "Du prüfst eine einzelne Sprachantwort eines Werksmitarbeiters (deutsch). " +
    "Antworte ausschließlich mit strikt gültigem JSON, keine Erklärung außerhalb des JSON. " +
    "unclear=true bei Hintergrundlärm, unverständlichem Text, leerem Inhalt, nur Füllwörtern, oder wenn keine verwertbare Information enthalten ist. " +
    "valid=true nur wenn die Antwort den Anforderungen genügt. " +
    "normalized: kurze bereinigte Fassung für die Datenbank (1–200 Zeichen), oder null wenn unclear.";

  const user = `Feld: ${field}\nAnforderung: ${fieldHint}\n\nTranskript:\n${transcript}`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      valid?: unknown;
      unclear?: unknown;
      normalized?: unknown;
    };

    const valid = parsed.valid === true;
    const unclear = parsed.unclear === true;
    let normalized: string | null = null;
    if (parsed.normalized != null && typeof parsed.normalized === "string") {
      const n = parsed.normalized.trim();
      normalized = n.length > 0 ? n.slice(0, 500) : null;
    }

    if (unclear || !valid) {
      return {
        valid: false,
        unclear: true,
        normalized: null,
      };
    }

    if (!normalized || normalized.length < 2) {
      return { valid: false, unclear: true, normalized: null };
    }

    return { valid: true, unclear: false, normalized };
  } catch {
    return { valid: false, unclear: true, normalized: null };
  }
}
