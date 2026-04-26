"use server";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { cookies } from "next/headers";

type SiteContentItem = {
  id: string;
  type: string;
  url?: string;
  title: string;
  created_at: string;
};

export type AxonAiCard = {
  id: string;
  title: string;
  url: string;
  type: string;
};

export type AxonAiAssistantResponse = {
  answer: string;
  cards: AxonAiCard[];
  error?: string;
};

const sanitizeEnv = (value: string | undefined) => {
  if (!value) return undefined;
  return value.replace(/\s/g, "");
};

async function requireUserId(): Promise<string> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) {
    throw new Error("Nicht eingeloggt.");
  }

  const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabaseUser.auth.getUser();
  if (error || !data.user) {
    throw new Error("Session ist nicht gueltig.");
  }
  return data.user.id;
}

async function loadSiteContent(service: SupabaseClient): Promise<SiteContentItem[]> {
  // In einigen DBs heißt die URL-Spalte anders oder existiert nicht.
  // Deshalb: zuerst mit url versuchen, sonst ohne url fallbacken.
  const first = await service
    .from("site_content")
    .select("id,type,url,title,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (!first.error) {
    return (first.data ?? []) as SiteContentItem[];
  }

  const msg = first.error.message ?? "";
  if (msg.includes("column site_content.url does not exist")) {
    const fallback = await service
      .from("site_content")
      .select("id,type,title,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (fallback.error) {
      throw new Error(
        `site_content konnte nicht geladen werden: ${fallback.error.message}`,
      );
    }

    return ((fallback.data ?? []) as Array<Omit<SiteContentItem, "url">>).map(
      (i) => ({ ...i, url: "" }),
    );
  }

  throw new Error(`site_content konnte nicht geladen werden: ${msg}`);
}

export async function askAxonAi(
  questionRaw: string,
): Promise<AxonAiAssistantResponse> {
  try {
    const question = (questionRaw ?? "").trim();
    if (!question) {
      return { answer: "", cards: [], error: "Bitte eine Frage eingeben." };
    }

    // Require login (Manager)
    await requireUserId();

    const supabaseUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseAnonKey = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseUrl || !supabaseAnonKey) {
      return { answer: "", cards: [], error: "Supabase ist nicht konfiguriert." };
    }

    const service = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

    const siteContent = await loadSiteContent(service);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { answer: "", cards: [], error: "OPENAI_API_KEY fehlt." };
    }
    const openai = new OpenAI({ apiKey });

    const model = process.env.OPENAI_GPT_MODEL?.trim() || "gpt-4o-mini";

    const system =
      "Du bist AXON AI fuer Manager. Antworte auf Deutsch. " +
      "Du bekommst Kontext aus der Tabelle site_content (Videos/Links). " +
      "Wenn passende Eintraege existieren, gib sie als cards zur Anzeige im Chat aus. " +
      "Gib strikt gueltiges JSON zurueck im Format: {\"answer\": string, \"cards\": [{\"id\": string, \"title\": string, \"url\": string, \"type\": string}]}. " +
      "cards sollen nur aus den gelieferten site_content Items stammen (id muss passen).";

    const context = siteContent.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      url: i.url,
      created_at: i.created_at,
    }));

    const user = `Frage:
${question}

Kontext (site_content, JSON):
${JSON.stringify(context)}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: AxonAiAssistantResponse;
    try {
      parsed = JSON.parse(raw) as AxonAiAssistantResponse;
    } catch {
      return {
        answer: "",
        cards: [],
        error: "AXON AI Antwort konnte nicht verarbeitet werden.",
      };
    }

    const safeCards = Array.isArray(parsed.cards) ? parsed.cards : [];
    const byId = new Map(siteContent.map((i) => [i.id, i]));
    const cards: AxonAiCard[] = safeCards
      .map((c) => {
        const row = byId.get(c.id);
        if (!row) return null;
        return { id: row.id, title: row.title, url: row.url, type: row.type };
      })
      .filter(Boolean) as AxonAiCard[];

    return {
      answer: typeof parsed.answer === "string" ? parsed.answer : "",
      cards,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unbekannter Fehler.";
    return { answer: "", cards: [], error: msg };
  }
}

