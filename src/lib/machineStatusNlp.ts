/**
 * NLP-Signalwörter → Maschinenstatus (DB: active | maintenance | offline).
 * Reihenfolge: zuerst Abschalten, dann Warten, dann Anschalten/Inbetrieb.
 */

export type MachineStatusNlp = "active" | "maintenance" | "offline";

/**
 * Wandelt erkannte Schlüsselwörter (Deutsch) in Status-Updates um.
 * Gibt null zurück, wenn kein eindeutiges Signal erkannt wurde.
 */
export function mapNlpKeywordsToMachineStatus(
  transcriptText: string,
): MachineStatusNlp | null {
  const t = transcriptText.toLowerCase();

  if (
    /\b(abschalten|abschalt|schalte\s+ab|schaltet\s+ab|schalt\w*\s+ab|schalte\s+aus|ausschalten|not-?\s*aus|strom\s+weg|maschine\s+aus|anlage\s+aus|machine\s+aus|hauptschalter)\b/.test(
      t,
    )
  ) {
    return "offline";
  }

  if (
    /\b(warten|warte\s+jetzt|wartung|wartungsmodus|reparatur|steht\s+still|stillstand|pausiere|pause)\b/.test(
      t,
    )
  ) {
    return "maintenance";
  }

  if (
    /\b(anschalten|anschalt|einschalten|einschalt|starte|starten|in\s+betrieb|betrieb\s+aufnehmen|läuft\s+wieder|läuft\s+wieder\s+an|wieder\s+an|funktioniert\s+wieder)\b/.test(
      t,
    )
  ) {
    return "active";
  }

  return null;
}

/** @deprecated Nutze mapNlpKeywordsToMachineStatus – Alias für Kompatibilität */
export function deriveMachineStatusFromTranscript(
  transcriptText: string,
): MachineStatusNlp | null {
  return mapNlpKeywordsToMachineStatus(transcriptText);
}
