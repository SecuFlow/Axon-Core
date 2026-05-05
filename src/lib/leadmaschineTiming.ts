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
 * Harter Tages-Cap fuer NEUE Erstkontakte (mail_1) pro Segment.
 *
 * Diese Konstante ist eine Sicherheits-Obergrenze, die DB-Werte von
 * `leadmaschine_settings.leads_per_day_*` capped. Ueberschreitet die
 * Settings-Konfiguration diesen Wert, wird im Runner auf diesen Wert
 * geclampt.
 *
 * Historie:
 *   - vorher 5/Tag (DSGVO/UWG-konservativ, hartcodiert, nicht editierbar)
 *   - ab 05/2026: 30/Tag (bewusste Geschaeftsentscheidung, Editierbarkeit
 *     im Admin-UI freigegeben).
 *
 * UWG-Risiko-Hinweis (nicht entfernen):
 *   B2B-Direktansprache an konkrete Entscheider ohne mutmassliche
 *   Einwilligung gemaess UWG §7 Abs. 2 Nr. 3 ist unzulaessig. Die Erhoehung
 *   auf 30/Tag ist eine bewusst akzeptierte Entscheidung des Plattform-
 *   Inhabers. Die folgenden Schutzschichten bleiben aktiv:
 *     - GENERIC_MAILBOX_LOCAL_PARTS-Block (kein info@/kontakt@)
 *     - manager_name-Pflicht (kein Versand ohne konkreten Entscheider)
 *     - leads.auto_send_blocked als Pro-Lead-Notbremse
 *   Folg-Ups (Tag 3) und Demos (Tag 5) zaehlen NICHT gegen diesen Cap.
 */
export const LEAD_DAILY_HARD_CAP = 30;
