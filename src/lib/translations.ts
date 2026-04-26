/**
 * Zentrale Begriffe DE/EN für spätere Locale-Umschaltung.
 * Nutzung: `t.dashboard.title[lang]` mit lang: "de" | "en".
 */
export const t = {
  dashboard: {
    title: { de: "Dashboard", en: "Dashboard" },
    corporate: { de: "Konzern", en: "Corporate" },
    maintenance: { de: "Wartung", en: "Maintenance" },
    inventory: { de: "Maschinen-Inventar", en: "Machine inventory" },
    location: { de: "Standort", en: "Location" },
    reports: { de: "Berichte", en: "Reports" },
  },
  repairCase: {
    case: { de: "Reparaturfall", en: "Repair case" },
    priority: { de: "Priorität", en: "Priority" },
    status: { de: "Status", en: "Status" },
    machine: { de: "Maschine", en: "Machine" },
    sparePart: { de: "Ersatzteil", en: "Spare part" },
    analysis: { de: "KI-Analyse", en: "AI analysis" },
  },
  auth: {
    signIn: { de: "Anmelden", en: "Sign in" },
    signOut: { de: "Abmelden", en: "Sign out" },
    session: { de: "Sitzung", en: "Session" },
  },
  audit: {
    log: { de: "Protokoll", en: "Audit log" },
    changed: { de: "geändert", en: "changed" },
  },
  common: {
    loading: { de: "Lädt…", en: "Loading…" },
    save: { de: "Speichern", en: "Save" },
    cancel: { de: "Abbrechen", en: "Cancel" },
    error: { de: "Fehler", en: "Error" },
    success: { de: "Erfolg", en: "Success" },
  },
} as const;

export type AppLocale = "de" | "en";

export function pickLocale(acceptLanguage: string | null | undefined): AppLocale {
  if (!acceptLanguage) return "de";
  if (/^\s*en/i.test(acceptLanguage)) return "en";
  return "de";
}
