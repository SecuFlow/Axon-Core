## Onboarding Runbook (Pilotkunden)

Ziel: Ein neuer Pilotkunde ist nach Registrierung/Kauf **in <10 Minuten** vollständig einsatzbereit – ohne manuelle DB-Eingriffe.

### A) Soll-Zustand nach Onboarding

- **Mandant vorhanden**
  - `profiles.mandant_id` (oder Legacy: `profiles.tenant_id`) ist gesetzt
- **Konzern-Datensatz vorhanden**
  - mindestens eine `companies`-Zeile für den Mandanten (`companies.tenant_id = <mandant>`)
  - `companies.name` ist **kein** E-Mail-String
- **Mindestens 1 Standort vorhanden**
  - `locations.company_id = <mandant>` mindestens 1×
- **Branding vorhanden**
  - `branding.tenant_id = <mandant>` existiert (optional, aber empfohlen) und bleibt nach Logout/Login erhalten
- **Manager-Zugang**
  - mindestens ein Account mit Manager/Admin-Rechten im Tenant

### B) Verifikation (automatisiert)

Nutze das Script:

```bash
node scripts/verify-tenant-setup.mjs "<kundemail-oder-userId>"
```

Erwartung:
- `ok: true`
- `checks.company_name_ok: true`
- `checks.has_location: true`
- `checks.has_manager_like_user: true`

### C) Wenn ein Check fehlschlägt

- **company_name_ok = false**
  - Konzernname ist E-Mail → `node scripts/fix-tenant-company-name.mjs "<email>" "<Konzernname>"`
- **has_location = false**
  - Standort fehlt → im Dashboard per Standort-Flow anlegen (oder Setup-Automation ergänzen)
- **has_manager_like_user = false**
  - Rolle prüfen: `profiles.role` / `companies.role` im Tenant

