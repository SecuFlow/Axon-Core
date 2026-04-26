"use server";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export type PublicAiCard = {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
};

export type PublicAiResponse = {
  answer: string;
  cards: PublicAiCard[];
  blocked?: boolean;
  block_reason?: string;
  duplicate_detected?: boolean;
  duplicate_similarity?: number;
};

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

const BLOCKLIST_REGEX = /(politik|partei|wahl|regierung|bundestag|religion|kirche|allah|jesus|judentum|islam|christentum|hindu|buddh|gehalt|lohn|bonus|umsatz|marge|gewinn|kundendaten|vertrag|intern|vertraulich|geheim)/i;

function isAllowedDomain(question: string): { ok: boolean; reason?: string } {
  const q = question.trim();
  if (!q) return { ok: false, reason: "Leere Frage." };
  if (BLOCKLIST_REGEX.test(q)) {
    return {
      ok: false,
      reason:
        "Nicht-technisches Thema oder private Firmendaten. Erlaubt sind nur Heilwissen (Instandsetzung) und Maschinenwissen.",
    };
  }
  return { ok: true };
}

async function getOpenAi(): Promise<OpenAI> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY fehlt.");
  return new OpenAI({ apiKey });
}

async function getServiceClient() {
  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !anonKey) throw new Error("Supabase ist nicht konfiguriert.");
  const key = serviceKey ?? anonKey;
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function embedText(openai: OpenAI, text: string): Promise<number[]> {
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  const vec = emb.data?.[0]?.embedding;
  if (!vec || !Array.isArray(vec)) throw new Error("Embedding fehlgeschlagen.");
  return vec;
}

export async function askPublicAi(questionRaw: string): Promise<PublicAiResponse> {
  const question = (questionRaw ?? "").trim();
  const allow = isAllowedDomain(question);
  if (!allow.ok) {
    return {
      answer:
        "Ich kann dazu nicht helfen. Ich beantworte nur technische Fragen zu Instandsetzung (Heilwissen) und Maschinenwissen.",
      cards: [],
      blocked: true,
      block_reason: allow.reason,
    };
  }

  const openai = await getOpenAi();
  const supabase = await getServiceClient();

  // Context: only public cases and public knowledge
  const { data: cases } = await supabase
    .from("ai_cases")
    .select(
      "id,created_at,analysis_text,solution_steps,machine_name,required_part,original_priority,priority_override",
    )
    .eq("share_with_public", true)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: knowledge } = await supabase
    .from("public_knowledge")
    .select("id,category,content,created_at,is_duplicate")
    .eq("is_duplicate", false)
    .order("created_at", { ascending: false })
    .limit(200);

  // GPT classification to enforce allowed categories
  const classifier = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Klassifiziere die Frage strikt in eine Kategorie: Heilwissen, Maschinenwissen, Blockiert. Antworte nur JSON {\"category\": \"...\", \"reason\": \"...\"}.",
      },
      { role: "user", content: question },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const classRaw = classifier.choices[0]?.message?.content ?? "{}";
  let category: "Heilwissen" | "Maschinenwissen" | "Blockiert" = "Maschinenwissen";
  let classReason = "";
  try {
    const parsed = JSON.parse(classRaw) as { category?: string; reason?: string };
    const cat = (parsed.category ?? "").toString();
    if (cat === "Heilwissen" || cat === "Maschinenwissen" || cat === "Blockiert") {
      category = cat;
    } else {
      category = "Blockiert";
    }
    classReason = (parsed.reason ?? "").toString();
  } catch {
    category = "Blockiert";
    classReason = "Klassifizierung fehlgeschlagen.";
  }

  if (category === "Blockiert") {
    return {
      answer:
        "Ich kann dazu nicht helfen. Ich beantworte nur technische, faktische und neutrale Fragen zu Instandsetzung (Heilwissen) und Maschinenwissen.",
      cards: [],
      blocked: true,
      block_reason: classReason || "Nicht erlaubt.",
    };
  }

  const neutralitySystem =
    "Du bist die AxonCore KI. Deine Antworten sind rein technisch, faktisch und neutral. " +
    "Du bist unabhängig von Staaten, Unionen oder Religionen. Verweigere Antworten zu nicht-technischen Themen. " +
    "Nutze nur den bereitgestellten Kontext. Wenn der Kontext nicht reicht, sage das klar.";

  // Answer as JSON so the client can render cards
  const model = process.env.OPENAI_GPT_MODEL?.trim() || "gpt-4o";
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: neutralitySystem },
      {
        role: "user",
        content: `Kategorie: ${category}

Frage: ${question}

Öffentlicher Kontext (ai_cases mit share_with_public=true, JSON):
${JSON.stringify(cases ?? [])}

Öffentlicher Kontext (public_knowledge, JSON):
${JSON.stringify(knowledge ?? [])}

Antworte strikt als JSON:
{
  "answer": string,
  "cards": [{"id": string, "title": string, "subtitle": string}],
  "knowledge_to_store": [{"category": "Heilwissen"|"Maschinenwissen", "content": string}]
}
Cards sollen passende Einträge referenzieren:
- Für ai_cases: id muss aus ai_cases stammen und title soll Maschine + Ersatzteil enthalten.
- Für public_knowledge: id muss aus public_knowledge stammen und title kurz zusammenfassen.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  type CaseRow = {
    id: string;
    machine_name?: string | null;
    required_part?: string | null;
  };
  type KnowledgeRow = { id: string };
  type ParsedCard = { id?: unknown; title?: unknown; subtitle?: unknown };
  type ParsedKnowledge = { category?: unknown; content?: unknown };
  type ParsedResponse = {
    answer?: unknown;
    cards?: unknown;
    knowledge_to_store?: unknown;
  };

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const byCaseId = new Map(
    ((cases ?? []) as CaseRow[]).map((c) => [c.id, c] as const),
  );
  const byKnowledgeId = new Map(
    ((knowledge ?? []) as KnowledgeRow[]).map((k) => [k.id, k] as const),
  );

  let answer = "";
  let cards: PublicAiCard[] = [];
  let knowledgeToStore: Array<{ category: "Heilwissen" | "Maschinenwissen"; content: string }> =
    [];

  try {
    const parsed = JSON.parse(raw) as ParsedResponse;
    answer = typeof parsed.answer === "string" ? parsed.answer : "";
    const safeCards: ParsedCard[] = Array.isArray(parsed.cards) ? parsed.cards : [];

    cards = safeCards
      .map((c): PublicAiCard | null => {
        const id = typeof c.id === "string" ? c.id : "";
        const title = typeof c.title === "string" ? c.title : "";
        const subtitle = typeof c.subtitle === "string" ? c.subtitle : undefined;
        if (!id || !title) return null;

        const row = byCaseId.get(id);
        if (row) {
          const t =
            row.machine_name || row.required_part
              ? `${row.machine_name ?? "Maschine"} · ${row.required_part ?? "Teil"}`
              : title;
          return { id, title: t, subtitle: subtitle ?? "Öffentlicher Fall" };
        }

        if (byKnowledgeId.has(id)) {
          return { id, title, subtitle: subtitle ?? "Öffentliches Wissen" };
        }

        return null;
      })
      .filter((c): c is PublicAiCard => c !== null);

    const safeStore: ParsedKnowledge[] = Array.isArray(parsed.knowledge_to_store)
      ? parsed.knowledge_to_store
      : [];
    knowledgeToStore = safeStore
      .map((k) => ({
        category: k?.category,
        content: k?.content,
      }))
      .filter(
        (k): k is { category: "Heilwissen" | "Maschinenwissen"; content: string } =>
          (k.category === "Heilwissen" || k.category === "Maschinenwissen") &&
          typeof k.content === "string" &&
          k.content.trim().length > 0,
      )
      .map((k) => ({ category: k.category, content: k.content.trim().slice(0, 4000) }));
  } catch {
    answer = "Antwort konnte nicht verarbeitet werden.";
    cards = [];
    knowledgeToStore = [];
  }

  // Dedupe + store knowledge (vector search) if model suggests it
  let duplicate_detected = false;
  let duplicate_similarity: number | undefined;

  for (const item of knowledgeToStore.slice(0, 3)) {
    const vec = await embedText(openai, item.content);

    const { data: matches } = await supabase.rpc("match_public_knowledge", {
      query_embedding: vec,
      match_threshold: 0.95,
      match_count: 1,
    });

    const top = Array.isArray(matches) ? matches[0] : null;
    const sim = top?.similarity as number | undefined;
    if (typeof sim === "number" && sim >= 0.95) {
      duplicate_detected = true;
      duplicate_similarity = sim;
      continue;
    }

    // Insert new knowledge with embedding
    await supabase.from("public_knowledge").insert({
      category: item.category,
      content: item.content,
      embedding: vec,
      is_duplicate: false,
      duplicate_of: null,
    });
  }

  return {
    answer,
    cards,
    duplicate_detected,
    duplicate_similarity,
  };
}

