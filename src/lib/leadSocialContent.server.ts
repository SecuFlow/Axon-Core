import OpenAI from "openai";

/**
 * KI Social Center - generiert LinkedIn Posts (2x/Woche) und
 * Kommentar-Entwuerfe zu Manager-Posts.
 *
 * Ton: Elias Stadler (Founder/CEO AxonCore) - Fokus auf Wissenssicherung,
 * Gnosis, Problemloesung, niemals direkter Sales.
 */

function sanitizeEnv(value: string | undefined) {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
}

function tryGetOpenAi(): OpenAI | null {
  const apiKey = sanitizeEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return (sanitizeEnv(process.env.OPENAI_GPT_MODEL) ?? "").trim() || "gpt-4o-mini";
}

export type CommentProspect = {
  manager_name: string;
  corporate_group_name: string | null;
  location_name: string | null;
  department: string | null;
  industry: string | null;
};

export type CommentResult = {
  text: string;
  model: string | null;
};

export type PostResult = {
  text: string;
  topic: string | null;
  model: string | null;
};

/**
 * Generiert einen fachlich fundierten LinkedIn-Kommentar zum Post eines Managers.
 *
 * Inhalt: geht auf Probleme/Themen des Posts ein und verknuepft sie mit
 * unserer Problemloesung (Wissenssicherung, Axon-Gedaechtnis).
 */
export async function generateLinkedInComment(input: {
  postText: string;
  prospect: CommentProspect;
}): Promise<CommentResult> {
  const openai = tryGetOpenAi();
  const postText = input.postText.trim();
  if (!postText) {
    return { text: "", model: null };
  }

  const managerName = input.prospect.manager_name.trim();
  const context = [
    input.prospect.corporate_group_name
      ? `Konzern: ${input.prospect.corporate_group_name}`
      : null,
    input.prospect.location_name ? `Standort: ${input.prospect.location_name}` : null,
    input.prospect.department ? `Bereich: ${input.prospect.department}` : null,
    input.prospect.industry ? `Branche: ${input.prospect.industry}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (!openai) {
    return {
      text: defaultComment({ managerName, postText }),
      model: null,
    };
  }

  const model = getModel();
  const system =
    "Du schreibst einen LinkedIn-Kommentar in deutscher Sprache im Ton von Elias Stadler " +
    "(Founder/CEO AxonCore - Digitales Betriebsgedaechtnis). Der Kommentar ist unter einem Post " +
    "eines Konzern-Standort-Managers. Zweck: Wissenssicherung, fachlicher Diskurs, subtile " +
    "Verknuepfung mit unserer Problemloesung (Betriebsgedaechtnis, Know-how-Transfer). " +
    "STRIKT: Kein offener Sales-Pitch, keine CTAs, keine Emojis, keine Hashtags. 3-5 kurze Saetze. " +
    "Fachlich fundiert, wertschaetzend, mit einer klugen Beobachtung oder Frage am Ende. " +
    "Sprich den Autor nicht mit Namen an (wirkt auf LinkedIn affektiert). " +
    "Output: nur der reine Kommentar-Text, ohne Anfuehrungszeichen, ohne Meta-Kommentare.";

  const user =
    `Autor des Posts: ${managerName}${context ? ` (${context})` : ""}\n\n` +
    `Post-Text:\n"""\n${postText.slice(0, 3500)}\n"""\n\n` +
    `Schreibe einen passenden Kommentar-Entwurf (3-5 Saetze).`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: 280,
    });
    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    if (!raw) {
      return { text: defaultComment({ managerName, postText }), model };
    }
    return { text: raw.slice(0, 1200), model };
  } catch {
    return { text: defaultComment({ managerName, postText }), model };
  }
}

function defaultComment(input: { managerName: string; postText: string }): string {
  void input;
  return (
    "Spannender Punkt. Genau an dieser Stelle entscheidet sich oft, ob ein Betrieb sein " +
    "Wissen wirklich sichert oder nur dokumentiert. Unsere Erfahrung zeigt: der Hebel liegt " +
    "weniger im Tool, mehr in der Routine direkt am Arbeitsplatz. Wie geht ihr konkret damit um?"
  );
}

/**
 * Generiert einen LinkedIn-Post im Namen von Elias Stadler.
 * Zweck: Praesenz, Wissensvermittlung, Vertrauensaufbau - kein Sales.
 */
export async function generateLinkedInPost(input?: {
  topicHint?: string | null;
}): Promise<PostResult> {
  const openai = tryGetOpenAi();
  const topicHint = (input?.topicHint ?? "").trim() || null;

  if (!openai) {
    return {
      text: defaultPost(),
      topic: topicHint ?? "Wissenssicherung",
      model: null,
    };
  }

  const model = getModel();
  const system =
    "Du schreibst einen LinkedIn-Post in deutscher Sprache im Ton von Elias Stadler " +
    "(Founder/CEO AxonCore - Digitales Betriebsgedaechtnis fuer die Industrie). " +
    "ZWECK: Praesenz zeigen, Wissen vermitteln, Vertrauen zu Profil-Besuchern aufbauen. " +
    "KEIN direkter Verkauf, KEINE Sonderangebote, KEIN 'buche eine Demo'. " +
    "Stil: klar, ruhig, souveraen, leicht philosophisch (Gnosis/Problemloesung), Branchen-Bezug " +
    "zu Industrie, Produktion, Instandhaltung, Konzern-Standorten. " +
    "Format: 8-12 Zeilen (kurze Absaetze, je 1-3 Saetze), keine Emojis, max. 3 Hashtags am Ende " +
    "(#Wissenssicherung #Industrie #AxonCore o.ae.). " +
    "Output als JSON: {\"topic\": \"<Kurzthema>\", \"text\": \"<Post-Text>\"}.";

  const user = topicHint
    ? `Thema-Hinweis: ${topicHint}. Schreibe einen Post-Entwurf.`
    : "Schreibe einen Post-Entwurf zu einem aktuellen, relevanten Thema aus Industrie/Wissenssicherung/Konzern-Standorten.";

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.55,
      max_tokens: 600,
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { text?: unknown; topic?: unknown };
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    const topic = typeof parsed.topic === "string" ? parsed.topic.trim() : topicHint;
    if (!text) {
      return { text: defaultPost(), topic: topic ?? "Wissenssicherung", model };
    }
    return { text: text.slice(0, 6000), topic: topic || null, model };
  } catch {
    return { text: defaultPost(), topic: topicHint ?? "Wissenssicherung", model };
  }
}

function defaultPost(): string {
  return (
    "In vielen Produktionsbetrieben liegt das wertvollste Kapital nicht in Maschinen, " +
    "sondern im Kopf der Kolleginnen und Kollegen.\n\n" +
    "Und genau dort ist es am unsichersten: eine Kuendigung, ein Ruhestand, ein Wechsel " +
    "zwischen Schichten - und ploetzlich fehlt das Wissen, das ueber Jahre gewachsen ist.\n\n" +
    "Die meisten Betriebe versuchen, das mit noch mehr Dokumentation zu loesen. " +
    "Meine These: Das ist der falsche Hebel. " +
    "Wissen muss dort gesichert werden, wo es entsteht - an der Maschine, im Arbeitsalltag, " +
    "mit so wenig Reibung wie moeglich.\n\n" +
    "Wer es schafft, dieses stille Wissen auffindbar zu machen, gewinnt einen Vorsprung, " +
    "den keine neue Anlage ausgleichen kann.\n\n" +
    "#Wissenssicherung #Industrie #AxonCore"
  );
}
