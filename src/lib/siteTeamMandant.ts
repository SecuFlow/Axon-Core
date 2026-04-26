/**
 * Feste Mandanten-ID für das globale Axon-Website-Team (HQ System-Einspeisung).
 * Konsistent mit Migration / ENV überschreibbar.
 */
export const AXON_SITE_TEAM_MANDANT_ID =
  process.env.AXON_SITE_TEAM_MANDANT_ID?.trim() ||
  "a0000000-0000-4000-8000-000000000001";
