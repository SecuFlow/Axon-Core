/** Tage bis zur nächsten automatisierten Sequenz-Aktion (Segment B etwas enger als Enterprise). */
export function sequenceFollowUpDays(
  leadSegment: "enterprise" | "smb" | null | undefined,
): { afterMail1: number; afterFollowUp: number } {
  // Zielsequenz: Tag 1 (Vorstellung), Tag 3 (Follow-Up), Tag 5 (Demo).
  // Daher jeweils +2 Tage bis zur nächsten Stufe.
  if (leadSegment === "smb") return { afterMail1: 2, afterFollowUp: 2 };
  return { afterMail1: 2, afterFollowUp: 2 };
}

/**
 * DSGVO/UWG Hard-Cap fuer neue Erstkontakte pro Kalendertag und Segment.
 *
 * Diese Konstante ist die Single-Source-of-Truth im Code. Sie ueberschreibt
 * den DB-Wert `leadmaschine_settings.leads_per_day_*` und ist im Admin-UI
 * nicht editierbar. Follow-Ups (Tag 3) und Demos (Tag 5) zaehlen nicht gegen
 * diesen Cap - nur mail_1_sent wird gezaehlt.
 *
 * Begruendung: Abstandsgebot / Spam-Vermeidung gemaess DSGVO + UWG §7.
 */
export const LEAD_DAILY_HARD_CAP = 5;
