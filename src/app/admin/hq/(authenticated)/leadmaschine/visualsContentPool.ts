// Pool von Inhalten für das Visuals Studio.
// Jeder „Neu generieren"-Klick zieht aus diesen Listen einen frischen Mix.
// Alle Inhalte sind eng am echten Produkt orientiert (Worker-App + Konzern-
// Dashboard), damit Social-Posts authentisch wirken.

export type TemplateKey =
  | "iphone_worker"
  | "browser_konzern"
  | "stats_hero"
  | "quote_card"
  | "feature_trio";

export type WorkerStep = "machine" | "issue" | "photo" | "category";

export type WorkerMockData = {
  step: WorkerStep;
  stepIndex: number;
  machine: string;
  issue: string;
  category: string;
  serial: string;
};

export type DashboardActivity = {
  time: string;
  machine: string;
  error: string;
  solution: string;
};

export type DashboardMachine = {
  name: string;
  location: string;
  status: "aktiv" | "wartung" | "offline";
  serial: string;
};

export type DashboardMockData = {
  kpiSecured: number;
  kpiExperts: number;
  activities: DashboardActivity[];
  machines: DashboardMachine[];
};

export type AccentPreset = { id: string; label: string; color: string };

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "axon", label: "Axon Cyan", color: "#00D1FF" },
  { id: "ocean", label: "Ocean", color: "#0EA5E9" },
  { id: "violet", label: "Violet", color: "#7C5CFF" },
  { id: "emerald", label: "Emerald", color: "#10B981" },
  { id: "amber", label: "Amber", color: "#F59E0B" },
  { id: "rose", label: "Rose", color: "#F43F5E" },
];

const HEADLINES_WORKER = [
  "Bericht in 30 Sekunden — direkt vom Werker.",
  "Foto. Stimme. Fertig.",
  "Wartung, wie sie 2026 aussehen sollte.",
  "Kein PDF. Kein Excel. Nur die Hand am Hebel.",
  "Werker sprechen — KI dokumentiert.",
  "Vom Anlagenstillstand zum Bericht — ohne Umweg.",
];

const SUBLINES_WORKER = [
  "Mikrofon-Knopf gedrückt halten, Problem beschreiben, Foto schießen. Der Rest passiert automatisch im Hintergrund.",
  "Die KI extrahiert Maschine, Fehler und Priorität aus der Sprache und legt einen strukturierten Fall an.",
  "Ein Knopf für Foto, einer für Stimme. Mehr braucht der Mitarbeiter nicht — der Bericht ist trotzdem vollständig.",
  "Anlage piept? Werker drückt drauf, sagt was los ist, und arbeitet weiter. Der Bericht liegt schon im Konzern-Dashboard.",
];

const HEADLINES_KONZERN = [
  "Werker-Berichte. Konzernweit. In Echtzeit.",
  "Eine Sicht. Alle Standorte. Live.",
  "KI priorisiert, der Manager handelt.",
  "Vom Werker direkt aufs Manager-Dashboard.",
  "Wartungsdaten, endlich ohne PDF-Stapel.",
];

const SUBLINES_KONZERN = [
  "Mandantengetrennt, mit Live-KPIs und KI-Priorisierung. Jeder Werker-Bericht erscheint sofort beim richtigen Manager.",
  "Standorte und Linien getrennt, Konzern-KPIs aggregiert. Wer überall den gleichen Blick braucht, hat ihn jetzt.",
  "Berichte werden automatisch in Maschinenakten einsortiert. Ausfälle bleiben nicht länger versteckt in Mails.",
  "Vom KI-Sicherheits-Score bis zum Maschinen-Trend — jede Zahl ist klickbar und führt zum Originalbericht.",
];

const HEADLINES_STATS = [
  "Wartung, neu gedacht.",
  "Was passiert ohne PDFs?",
  "Drei Zahlen aus dem Pilotbetrieb.",
  "Industrie 2026 — ohne Excel.",
];

const SUBLINES_STATS = [
  "Drei Zahlen, die unsere Pilotpartner nach 60 Tagen melden. Keine Excel-Templates, keine Verzögerung in der Linie.",
  "Was Werker und Manager nach zwei Monaten Pilot gemessen haben — quer durch CNC, Schmiede und Logistik.",
  "Vom ersten Bericht bis zum geschlossenen Fall. Die KI nimmt 80 % der Klick-Arbeit raus.",
];

const QUOTES = [
  {
    text: "Wir haben das erste Mal echte Wartungsdaten. Vorher gab es nur Excel-Tabellen, die niemand pflegte.",
    person: "Operations-Leiter",
    company: "Anlagenbauer · Süddeutschland",
  },
  {
    text: "Die KI versteht meine Werker, auch wenn sie in Dialekt sprechen. Das war für mich der Wendepunkt.",
    person: "Schichtleiter Wartung",
    company: "Logistik-Konzern · Hamburg",
  },
  {
    text: "Vom Anlagenstillstand bis zum geschlossenen Ticket: 11 Minuten statt 2 Stunden.",
    person: "Werkleiter",
    company: "Automotive-Zulieferer",
  },
  {
    text: "Mein Schichtleiter hat zum ersten Mal seit fünf Jahren Feierabend gemacht, ohne Berichte mitzunehmen.",
    person: "Plant Manager",
    company: "CNC-Fertigung · Bayern",
  },
];

const FEATURE_TRIOS = [
  [
    { title: "Stimme + Foto", body: "Der Werker drückt einen Knopf — der Rest läuft automatisch." },
    { title: "KI strukturiert", body: "Maschine, Fehler, Priorität — aus dem gesprochenen Satz extrahiert." },
    { title: "Konzern-Sicht", body: "Live auf dem Manager-Dashboard. Mandantengetrennt." },
  ],
  [
    { title: "Offline-fähig", body: "Halle ohne WLAN? Berichte werden lokal gepuffert und später synchronisiert." },
    { title: "Mehrsprachig", body: "Deutsch, Englisch, Polnisch — der Werker spricht, die KI versteht." },
    { title: "DSGVO-konform", body: "Verarbeitung in EU-Region, jeder Bericht prüfbar im Audit-Log." },
  ],
  [
    { title: "30 Sekunden", body: "Vom Anlagenstillstand bis zum strukturierten Bericht im Dashboard." },
    { title: "Null Excel", body: "Keine Templates mehr ausfüllen. Die KI erzeugt den Bericht aus Stimme." },
    { title: "Maschinen-Akten", body: "Jeder Bericht landet in der digitalen Akte der Maschine — auf Abruf." },
  ],
];

const CAPTIONS = [
  `Mitarbeiter brauchen 2 Tasten — Foto + Stimme.\nAlles andere macht die KI.\n\n• Wartungsberichte in 30 Sek\n• KI-Priorität automatisch\n• Foto + Stimme → strukturierter Fall\n\n#Industrie #Wartung #KI`,
  `Vom Werker direkt aufs Konzern-Dashboard.\nIn Echtzeit. Ohne Klick-Tour.\n\n• Live-Maschinenstatus\n• Mandantengetrennte Sicht\n• Berichte automatisch eingeordnet\n\n#KI #SmartManufacturing #Predictive`,
  `Was passiert, wenn der Werker keine PDFs mehr ausfüllen muss?\n\n• 78 % schnellere Reaktion auf Störungen\n• 12× mehr Wartungsdaten\n• 0 Excel-Templates\n\n#Wartung #Industrie40 #AXON`,
  `Wir haben unsere Pilotpartner gefragt:\n„Wie lange dauert es vom Anlagenstillstand bis zum Bericht?"\n\nVorher: 1–2 Stunden.\nMit AXON: 30 Sekunden.\n\nDas ist der Unterschied.\n\n#Industrie40 #AXON`,
  `KI in der Wartung — nicht für Power-User, sondern für den Werker am Hebel.\n\n• Stimme als Input\n• KI als Übersetzer\n• Manager-Dashboard als Output\n\n#KI #Wartung #Industrie`,
];

const BADGES_WORKER = [
  "AXON · MITARBEITER-APP",
  "AXON · WORKER",
  "WARTUNG · 2026",
  "FIELD APP · LIVE",
];

const BADGES_KONZERN = [
  "AXON · KONZERN-DASHBOARD",
  "AXON · HQ VIEW",
  "MANAGER-SICHT · LIVE",
  "PRODUKTION · CONTROL",
];

const BADGES_STATS = ["AXON · IMPACT", "PILOT · 60 TAGE", "ROI · GEMESSEN", "RESULTS"];

const BADGES_QUOTE = ["KUNDENSTIMME", "PILOT-FEEDBACK", "VOICE OF CUSTOMER"];

const BADGES_FEATURE = ["WIE ES FUNKTIONIERT", "PRODUKT · KURZ ERKLÄRT", "AXON IM ÜBERBLICK"];

// Realistische Industrie-Mockdaten.
const MACHINE_NAMES = [
  "CNC Linie 3",
  "Press 1A",
  "Roboter R2",
  "Lager-Förderer",
  "Schmiede Hochbett",
  "Fräse SLX-12",
  "Anlage F1",
  "Drehmaschine D4",
  "Spritzguss-Linie 7",
  "Stanze Hydraulik 2",
  "Schleifmaschine S-9",
  "Schweißroboter SR-12",
  "Pulverbeschichtung B",
];

const MACHINE_LOCATIONS = [
  "Halle A · Linie 1",
  "Halle B · Schmiede",
  "Werk Süd · Logistik",
  "Werk Nord · CNC",
  "Werk Ost · Montage",
  "Halle 3 · Pulverbeschichtung",
];

const ISSUE_TEXTS = [
  "Hydraulikdruck schwankt seit der Frühschicht.",
  "Ungewöhnliches Geräusch beim Anlauf, Vibration im Lager.",
  "Ölspur unter der Anlage, vermutlich Hydraulikleitung.",
  "Förderband stoppt sporadisch, ohne Fehlercode.",
  "Werkzeugwechsler fährt nicht mehr in Endposition.",
  "Temperatur an Spindel 1 über Sollwert.",
  "Servo-Motor zeigt erhöhten Stromzug.",
  "Druckluft fällt mehrmals pro Stunde aus.",
];

const SOLUTION_TEXTS = [
  "Hydraulikfilter getauscht, Pumpe entlüftet.",
  "Lager nachgeschmiert, Anlage läuft ruhig.",
  "Leitung abgedichtet, Ölstand kontrolliert.",
  "Sensor neu kalibriert, Pufferspeicher vergrößert.",
  "Endschalter justiert, Werkzeugwechsler getestet.",
  "Spindel-Kühlung erneuert, Sollwert wieder erreicht.",
];

const CATEGORIES = [
  "Maschinenfehler",
  "Prozessoptimierung",
  "Sicherheitsrisiko",
];

const SERIAL_PREFIXES = ["CNC", "SRV", "HYD", "PRS", "ROB", "FRS"];

function pickOne<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)] ?? arr[0]!;
}

function pickN<T>(arr: readonly T[], n: number, rng: () => number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

function makeRng(seed?: number): () => number {
  if (typeof seed !== "number" || !Number.isFinite(seed)) return Math.random;
  // Mulberry32 — kleine deterministische Quelle, falls wir mal Seeds wollen.
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSerial(rng: () => number): string {
  const prefix = pickOne(SERIAL_PREFIXES, rng);
  const num = Math.floor(rng() * 9000 + 1000);
  return `${prefix}-${num}`;
}

export function generateWorkerMockData(rng: () => number = Math.random): WorkerMockData {
  const steps: WorkerStep[] = ["machine", "issue", "photo"];
  const step = pickOne(steps, rng);
  const stepIndex = step === "machine" ? 1 : step === "issue" ? 2 : 3;
  return {
    step,
    stepIndex,
    machine: pickOne(MACHINE_NAMES, rng),
    issue: pickOne(ISSUE_TEXTS, rng),
    category: pickOne(CATEGORIES, rng),
    serial: randomSerial(rng),
  };
}

export function generateDashboardMockData(rng: () => number = Math.random): DashboardMockData {
  const machines = pickN(MACHINE_NAMES, 4, rng);
  const locations = pickN(MACHINE_LOCATIONS, 4, rng);
  const statuses: Array<DashboardMachine["status"]> = [
    "aktiv",
    "wartung",
    "aktiv",
    "offline",
  ];

  const activities: DashboardActivity[] = pickN(MACHINE_NAMES, 4, rng).map((m) => {
    const minsAgo = Math.floor(rng() * 240) + 5;
    const date = new Date(Date.now() - minsAgo * 60_000);
    const time = date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      time,
      machine: m,
      error: pickOne(ISSUE_TEXTS, rng),
      solution: pickOne(SOLUTION_TEXTS, rng),
    };
  });

  return {
    kpiSecured: Math.floor(rng() * 900) + 320,
    kpiExperts: Math.floor(rng() * 14) + 6,
    activities,
    machines: machines.map((name, i) => ({
      name,
      location: locations[i] ?? MACHINE_LOCATIONS[0]!,
      status: statuses[i] ?? "aktiv",
      serial: randomSerial(rng),
    })),
  };
}

export type VisualBundle = {
  template: TemplateKey;
  accent: string;
  badge: string;
  headline: string;
  subline: string;
  caption: string;
  worker: WorkerMockData;
  dashboard: DashboardMockData;
  quote: (typeof QUOTES)[number];
  featureTrio: (typeof FEATURE_TRIOS)[number];
};

export function generateBundleForTemplate(
  template: TemplateKey,
  seed?: number,
): VisualBundle {
  const rng = makeRng(seed);
  let badge: string;
  let headline: string;
  let subline: string;
  switch (template) {
    case "iphone_worker":
      badge = pickOne(BADGES_WORKER, rng);
      headline = pickOne(HEADLINES_WORKER, rng);
      subline = pickOne(SUBLINES_WORKER, rng);
      break;
    case "browser_konzern":
      badge = pickOne(BADGES_KONZERN, rng);
      headline = pickOne(HEADLINES_KONZERN, rng);
      subline = pickOne(SUBLINES_KONZERN, rng);
      break;
    case "stats_hero":
      badge = pickOne(BADGES_STATS, rng);
      headline = pickOne(HEADLINES_STATS, rng);
      subline = pickOne(SUBLINES_STATS, rng);
      break;
    case "quote_card":
      badge = pickOne(BADGES_QUOTE, rng);
      headline = pickOne(HEADLINES_STATS, rng);
      subline = pickOne(SUBLINES_STATS, rng);
      break;
    case "feature_trio":
    default:
      badge = pickOne(BADGES_FEATURE, rng);
      headline = "Wie AXON wirklich funktioniert.";
      subline = "Ein Knopf für den Werker. Ein Live-Dashboard für den Manager. Drei Bausteine dazwischen.";
      break;
  }

  return {
    template,
    accent: pickOne(ACCENT_PRESETS, rng).color,
    badge,
    headline,
    subline,
    caption: pickOne(CAPTIONS, rng),
    worker: generateWorkerMockData(rng),
    dashboard: generateDashboardMockData(rng),
    quote: pickOne(QUOTES, rng),
    featureTrio: pickOne(FEATURE_TRIOS, rng),
  };
}

export const TEMPLATE_META: Array<{
  key: TemplateKey;
  label: string;
  hint: string;
  ratio: "portrait" | "square";
}> = [
  { key: "iphone_worker", label: "Mitarbeiter-App · iPhone", hint: "Worker-Flow vom Gerät", ratio: "portrait" },
  { key: "browser_konzern", label: "Konzern-Dashboard · Browser", hint: "Manager-Sicht & Live-KPIs", ratio: "portrait" },
  { key: "stats_hero", label: "Stats-Hero", hint: "Drei Pilot-Zahlen", ratio: "square" },
  { key: "quote_card", label: "Kundenstimme", hint: "Zitat aus dem Pilot", ratio: "square" },
  { key: "feature_trio", label: "Feature-Trio", hint: "Stimme · KI · Dashboard", ratio: "portrait" },
];
