/**
 * Nur Texte für Worker-UI (client-sicher, keine Server-Imports).
 */
export const WORKER_VOICE_COPY = {
  askMachine:
    "Wie heißt die Maschine, oder welche Seriennummer hat sie?",
  askIssue:
    "Was ist passiert? Beschreib bitte kurz das Problem oder den Fehler.",
  askPhoto:
    "Bitte mach jetzt ein Foto von der Maschine oder dem Schaden.",
  /** Sofort nach Spracheingabe Schritt 1 (ohne Server) */
  ackStep1To2:
    "Verstanden. Was ist passiert? Beschreib bitte kurz das Problem oder den Fehler.",
  ackStep2To3:
    "Alles klar. Bitte mach jetzt ein Foto von der Maschine oder dem Schaden.",
} as const;
