## Pilot Ready bis September (AXON CORE)

Ziel: **10 Pilotkunden** zuverlässig onboarden, ohne Mandanten-Leaks, mit reproduzierbarem Setup und schneller Fehlerdiagnose.

### 1) Must-have (Go/No-Go)

- **Mandanten-Scope ist stabil**
  - Dashboard: `/api/dashboard/diagnostic-scope` liefert `ok: true` und `scope_matches: true`
  - Team/Standorte/Branding können **nie** mandantenübergreifend geladen werden (auch nicht nach F5 / Branding-Speichern)
- **Onboarding ist deterministisch**
  - Nach Registrierung/Kauf existieren: Tenant/Mandant, Konzern-Record, (mind.) 1 Standort, Manager-Zugang
  - Keine manuellen DB-Fixes mehr nötig (oder: dokumentierte Ausnahme + Script)
- **Branding ist persistent**
  - Branding speichern → Reload → Logout/Login → Branding bleibt
  - Branding wirkt in Konzern-Dashboard **und** Worker-App (Farbe + Logo)
- **Backup/Cron läuft**
  - Cron/Backups laufen automatisch (Secrets gesetzt, Monitoring vorhanden)

### 2) Should-have (Pilot-Komfort)

- **Pagination vorbereitet** (Team-/Listen-Endpunkte)
  - Kein Hard-Limit, das Nutzer “unsichtbar” macht (z. B. bei >1000 Users)
- **Observability**
  - Audit-/Security-Logs bei Scope-Mismatch
  - “Was ist kaputt?” in <5 Minuten beantwortbar
- **Support-Flow**
  - “Pilotkunde meldet Bug” → reproduzierbarer Schrittplan + schneller Fix/Deploy

### 3) Wiederholbare Tests (kurz)

- **Scope-Test**
  - Konzern-Login → „Mitarbeiter & Manager“ → 20× F5 → es dürfen **nur eigene Nutzer/Mandate** sichtbar sein
  - Branding speichern → wieder 20× F5 → weiterhin nur eigener Scope
- **Branding-Persistenz**
  - Branding speichern → Logout/Login → Branding muss sofort wieder da sein
- **Standorte**
  - Standort anlegen/sehen/löschen nur im eigenen Konzern

