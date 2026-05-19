// Standalone-Preview: generiert Mail 1 + 2 + 3 fuer einen Lead.
// Aufruf:  node scripts/preview-mail-sequence.mjs <lead_id_oder_apollo_person_id>
// Falls kein Argument: nimmt den juengsten Apollo-Lead.

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* file optional */
  }
}
loadEnvFile(resolve(process.cwd(), ".env.production.local"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_GPT_MODEL || "gpt-4.1";

if (!SUPA_URL || !SUPA_KEY) {
  console.error("FEHLT: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error("FEHLT: OPENAI_API_KEY");
  process.exit(1);
}

const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

function salutation(lead) {
  const n = (lead.manager_name || "").trim();
  if (!n) return "Hallo";
  if (/^Herr\s+/i.test(n)) return `Sehr geehrter ${n}`;
  if (/^Frau\s+/i.test(n)) return `Sehr geehrte ${n}`;
  return `Hallo ${n}`;
}

function formatRevenue(r) {
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) return null;
  if (r >= 1e9) return `${(r / 1e9).toFixed(1)} Mrd €/Jahr`;
  if (r >= 1e6) return `${(r / 1e6).toFixed(1)} Mio €/Jahr`;
  return `${Math.round(r / 1e3)} k €/Jahr`;
}

function compactFacts(l) {
  const parts = [
    l.corporate_group_name && `Konzern: ${l.corporate_group_name}`,
    l.location_name && `Standort: ${l.location_name}`,
    l.manager_name && `Manager: ${l.manager_name}`,
    l.department && `Position: ${l.department}`,
    l.linkedin_url && `LinkedIn: ${l.linkedin_url}`,
    l.domain && `Domain: ${l.domain}`,
    l.industry && `Branche: ${l.industry}`,
    typeof l.employee_count === "number" && `Mitarbeiter: ${l.employee_count}`,
    formatRevenue(l.revenue_eur),
    l.hq_location && `HQ: ${l.hq_location}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

function buildSystemPrompt(segment, kind, hasManager, hasResearch) {
  const baseTone =
    "Du schreibst auf Deutsch im Ton von Elias Stadler (Founder/CEO AxonCore): direkt, konkret, ohne Floskeln. " +
    "Keine Buzzwords ('innovativ', 'synergistisch', 'Mehrwert', 'wertvoll', 'optimieren'). " +
    "Keine Markdown, keine technischen IDs/Slugs/UUIDs, keine Demo-/Test-Wortspiele in der finalen Mail. " +
    "Body als Plaintext mit Absaetzen. Maximal 1 konkrete Frage am Ende.";
  const lengthRule =
    segment === "smb" ? " Laenge: 70-110 Woerter. Maximal 4 Absaetze." : " Laenge: 90-140 Woerter. Maximal 4 Absaetze.";
  const personalizationRule = hasManager
    ? " Empfaenger ist namentlich bekannt (UWG §7 B2B-konform): persoenliche, sachliche Anrede. Greife Position/Standort/LinkedIn-Kontext im Opener auf, ohne Namens-Dropping-Floskeln."
    : " Empfaenger ist nicht namentlich bekannt: nutze 'Hallo' als Opener.";
  const researchRule = hasResearch
    ? " Research-Kontext liegt vor: nutze EINE konkrete Beobachtung im Opener. Hypothesengetrieben."
    : " Kein Research-Kontext: plausible, branchen-spezifische Hypothese (Knowledge-Drain, Fluktuation, Standort-Skalierung) als Hook.";
  const segmentRule =
    segment === "enterprise"
      ? " Empfaenger ist Werkleiter/Standortleiter/Plant Manager an einem Konzernstandort. Konkret: Industrie-Produktion, mehrere Standorte, Knowledge-Drain durch Fluktuation. Sprache: gehoben aber nicht abgehoben."
      : " Empfaenger ist Geschaeftsfuehrer/Inhaber eines KMU. Sprache: bodenstaendig, ohne Konzern-Jargon.";
  const kindRule =
    kind === "mail_1"
      ? " Stufe: Erstkontakt. Ziel: kurzer Hook (1 Beobachtung/Hypothese) + 1 Satz, was AxonCore loest + 15-Min-Frage."
      : kind === "follow_up"
        ? " Stufe: Follow-Up nach 2 Tagen ohne Antwort. NEUER Aspekt + zugespitzte Hypothese + 15-Min-Frage. Schliesse NICHT mit 'falls kein Interesse'."
        : segment === "enterprise"
          ? " Stufe: Demo-Einladung Enterprise. Im Anschluss an deinen Body werden ZWEI Demo-Links angehaengt (Konzern-Dashboard und Mitarbeiter-App). Fuehre die zwei Sichten im Body ein, schreibe selbst KEINE Links/URLs."
          : " Stufe: Beratungsfrage SMB. Praezise Frage zu Web-Agenten und Voice-Agenten im Betrieb.";
  const subjectRule =
    " WICHTIG zur Betreffzeile: KEINE Floskeln wie 'Kurze Frage' oder 'Wissenssicherung'. " +
    "Konkret, neugierig-machend, max 60 Zeichen. Idealerweise mit Firmen- oder Standortnamen. " +
    "Generiere ZWEI Subject-Line-Varianten — eine direkte Frage und eine konkrete Beobachtung.";
  const outputFormat =
    " Gib STRIKT JSON zurueck (kein Markdown, keine Backticks):\n" +
    '{ "subject_a": "...", "subject_b": "...", "body": "..." }';
  return baseTone + lengthRule + personalizationRule + researchRule + segmentRule + kindRule + subjectRule + outputFormat;
}

async function generate(kind, lead) {
  const segment = lead.lead_segment === "smb" ? "smb" : "enterprise";
  const hasManager = !!(lead.manager_name && lead.manager_name.trim());
  const research = (lead.research_context || "").trim() || null;
  const system = buildSystemPrompt(segment, kind, hasManager, !!research);

  const user = [
    `Lead-Profil (${segment === "smb" ? "KMU" : "Konzernstandort/Enterprise"}):`,
    `Firma: ${lead.company_name}`,
    compactFacts(lead),
    research ? `\nResearch:\n${research}` : null,
    `\nMessage-Typ: ${kind}`,
  ]
    .filter(Boolean)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.45,
    max_tokens: 520,
  });
  const raw = completion.choices[0]?.message?.content || "";
  const parsed = JSON.parse(raw);
  return {
    subject_a: parsed.subject_a || parsed.subject || "(kein Subject)",
    subject_b: parsed.subject_b || parsed.subject_a || "(kein Subject)",
    body: parsed.body || "(leer)",
  };
}

async function main() {
  const arg = process.argv[2];

  let leadQuery = supa.from("leads").select("*").eq("research_source", "Apollo.io API Discovery");
  if (arg) {
    if (/^[0-9a-f]{8}-/.test(arg)) {
      leadQuery = leadQuery.eq("id", arg);
    } else {
      leadQuery = leadQuery.eq("apollo_person_id", arg);
    }
  } else {
    leadQuery = leadQuery.order("created_at", { ascending: false }).limit(1);
  }

  const { data, error } = await leadQuery;
  if (error || !data || data.length === 0) {
    console.error("Kein Lead gefunden:", error?.message);
    process.exit(1);
  }
  const lead = data[0];

  // Research-Notes laden, wenn vorhanden
  const rn = await supa
    .from("lead_research_notes")
    .select("personalization_hooks, summary")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (rn.data) {
    const ctx = [rn.data.summary, rn.data.personalization_hooks].filter(Boolean).join("\n\n");
    lead.research_context = ctx || null;
  }

  console.log("\n=== LEAD ===");
  console.log(`${lead.manager_name} (${lead.department})`);
  console.log(`${lead.company_name} · ${lead.industry || "?"} · ${lead.employee_count || "?"} MA`);
  console.log(`Email: ${lead.contact_email}`);
  console.log(`Segment: ${lead.lead_segment}`);
  if (lead.research_context) {
    console.log("\nResearch-Hooks (an LLM uebergeben):");
    console.log(lead.research_context.slice(0, 600));
  }

  const stages = [
    { kind: "mail_1", label: "MAIL 1 — Erstkontakt (Tag 0)" },
    { kind: "follow_up", label: "MAIL 2 — Follow-Up (Tag +3)" },
    { kind: "demo", label: "MAIL 3 — Demo-Einladung Enterprise (Tag +5)" },
  ];

  for (const s of stages) {
    process.stdout.write(`\n\n=== ${s.label} ===\n`);
    try {
      const r = await generate(s.kind, lead);
      console.log(`Subject A : ${r.subject_a}`);
      console.log(`Subject B : ${r.subject_b}`);
      console.log("---");
      console.log(r.body);
      if (s.kind === "demo" && lead.lead_segment !== "smb") {
        console.log("\n[Werden vom Outreach-Cron automatisch angehaengt:]");
        console.log("  Konzern-Dashboard:  https://app.axon-core.de/demo/<token-konzern>");
        console.log("  Mitarbeiter-App:    https://app.axon-core.de/demo/<token-werker>");
      }
    } catch (err) {
      console.error("Fehler:", err.message);
    }
  }
  console.log("\n");
}

main();
