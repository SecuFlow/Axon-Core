# Launch-Checkliste mit Aufwandschaetzung

## Zielbild

Diese Checkliste fokussiert auf einen sicheren Soft-Launch (Pilotkunden) und anschliessend Public-Launch.
Die Aufwandsschaetzung ist fuer 1 erfahrene Full-Stack-Person gerechnet.

## Legende

- Prio: `P0` = Blocker vor Verkauf, `P1` = kurz nach Pilotstart, `P2` = nachgelagert
- Aufwand:
  - `min` = optimistischer Aufwand bei glattem Durchlauf
  - `real` = realistische Planung
  - `puffer` = inkl. Ueberraschungen/Abstimmungen

## Phase 1: Verkaufsfaehig fuer Pilotkunden (P0)

### 1) Rechtliche Basis live schalten
- Prio: `P0`
- Aufgabe:
  - Seiten fuer `Impressum`, `Datenschutz`, `AGB` verlinken und im Footer sichtbar machen
  - Datenschutzhinweise fuer Supabase, Stripe, OpenAI, ElevenLabs aufnehmen
  - AVV-Workflow (Dokument + Versandprozess) definieren
- Aufwand: `min 6h` / `real 10h` / `puffer 14h`
- Abhaengigkeit: juristische Inhalte muessen bereitgestellt/freigegeben sein

### 2) Cookie-Consent (TTDSG/DSGVO) umsetzen
- Prio: `P0`
- Aufgabe:
  - Consent-Banner und Preferences
  - Tracking/optionale Cookies erst nach Zustimmung laden
  - Consent-Status revisionssicher speichern
- Aufwand: `min 4h` / `real 8h` / `puffer 12h`
- Abhaengigkeit: Entscheidung, welche Dienste technisch "essential" sind

### 3) Rate-Limiting und Abuse-Schutz auf kritischen APIs
- Prio: `P0`
- Aufgabe:
  - Limits fuer `/api/ai/*`, `/api/voice/tts`, Login/Registrierung
  - Tenant- und User-basierte Kontingente
  - klare Fehlermeldung bei `429` + Logging
- Aufwand: `min 6h` / `real 10h` / `puffer 14h`
- Abhaengigkeit: Produktentscheidung fuer Fair-Use/Grenzwerte

### 4) Produktionstaugliches Error-Monitoring
- Prio: `P0`
- Aufgabe:
  - Sentry (oder gleichwertig) in Frontend + API-Routen
  - Alerts auf `error rate`, Webhook-Fehler, AI-Fehler
  - Environment-Tags (prod/stage), Release-Tracking
- Aufwand: `min 4h` / `real 7h` / `puffer 10h`
- Abhaengigkeit: DSN/Projektzugang und Alarmkanal (Mail/Slack)

### 5) Backup- und Restore-Nachweis
- Prio: `P0`
- Aufgabe:
  - DB-Backup-Strategie dokumentieren
  - 1x Restore-Test in isolierter Umgebung
  - RTO/RPO als Betriebsziel definieren
- Aufwand: `min 3h` / `real 6h` / `puffer 8h`
- Abhaengigkeit: Zugriff auf Supabase-Projekt/Backups

## Phase 2: Stabiler Betrieb nach Pilotstart (P1)

### 6) E2E-Smoketests fuer Kern-Flow
- Prio: `P1`
- Aufgabe:
  - Playwright-Szenarien: Registrierung -> Checkout -> Login -> Worker-Flow -> Case-Anlage
  - Smoke-Suite bei jedem Deployment
- Aufwand: `min 8h` / `real 14h` / `puffer 20h`
- Abhaengigkeit: stabile Testdaten und Staging-Stripe-Config

### 7) Betriebsdoku fertigstellen
- Prio: `P1`
- Aufgabe:
  - `README.md` produktionsnah statt Boilerplate
  - `.env.example` und Setup-Guide
  - Runbook fuer Incidents und Rollback
- Aufwand: `min 4h` / `real 7h` / `puffer 10h`
- Abhaengigkeit: finale ENV-Liste und Deploy-Prozess

### 8) Support- und Status-Kommunikation
- Prio: `P1`
- Aufgabe:
  - Support-Adresse, SLA-Reaktionsrahmen, Ticketprozess
  - einfache Statusseite oder Status-Abschnitt
- Aufwand: `min 2h` / `real 4h` / `puffer 6h`
- Abhaengigkeit: Verantwortliche Person fuer Support

## Phase 3: Public-Launch-Haertung (P2)

### 9) Admin-Sicherheit erweitern
- Prio: `P2`
- Aufgabe:
  - 2FA fuer Admin-HQ
  - Session-Security-Haertung (Re-Auth fuer kritische Aktionen)
- Aufwand: `min 6h` / `real 10h` / `puffer 14h`

### 10) Compliance-Features fuer Enterprise
- Prio: `P2`
- Aufgabe:
  - Auskunfts-/Exportprozess pro Mandant
  - erweitertes Audit-Log-UI
- Aufwand: `min 8h` / `real 14h` / `puffer 20h`

## Gesamtaufwand (Orientierung)

- Nur P0 (Pilot-Verkauf): `min 23h` / `real 41h` / `puffer 58h`
- P0 + P1 (stabiler Marktstart): `min 37h` / `real 66h` / `puffer 94h`
- P0 + P1 + P2 (public-ready): `min 51h` / `real 90h` / `puffer 128h`

## Empfohlene Reihenfolge (kritischer Pfad)

1. Rechtstexte + AVV
2. Cookie-Consent
3. Rate-Limiting
4. Error-Monitoring
5. Backup/Restore-Nachweis
6. E2E-Smokes
7. Betriebsdoku

## Definition of Done (Pilot-Verkauf)

Pilotkunden koennen erst starten, wenn alle Punkte erfuellt sind:
- `P0`-Tasks sind live und geprueft
- Mindestens 1 End-to-End-Kauf inkl. Stripe-Webhook erfolgreich in Staging und Produktion
- Incident- und Support-Prozess dokumentiert
- Datenschutzseiten im Produkt sichtbar verlinkt
