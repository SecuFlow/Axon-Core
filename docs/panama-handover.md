## Panama Handover (AXON CORE) — Fokus: Skalierung & Sicherheit

Dieses Dokument beschreibt die **Mandanten-/Scope-Logik**, die wichtigsten **kritischen APIs**, und die **Guardrails**, damit Optimierungen (Performance/Architektur) sicher erfolgen.

### 1) Begriffe & Datenmodell (kurz)

- **Mandant / Tenant**: kanonisch über `mandant_id` (Legacy: teils `tenant_id`)
- **companies**
  - `companies.id` = PK (nicht Mandant!)
  - `companies.tenant_id` = Mandanten-UUID
  - `companies.role` = Rolle innerhalb des Mandanten (z. B. `admin`, `manager`, `user`)
- **profiles**
  - `profiles.id` = Auth-UUID
  - `profiles.mandant_id`/`profiles.tenant_id` = Mandanten-UUID (Scope)
  - `profiles.company_id` = FK auf `companies.id` (PK)

Wichtig: **`profiles.company_id` darf nie als Mandant verwendet werden**, sondern muss zu `companies.tenant_id` resolved werden.

### 2) Mandanten-/Scope-Auflösung (Server)

#### `requireKonzernTenantContext()` (`src/lib/konzernTenantContext.ts`)

- Liefert den Server-Kontext für Dashboard-APIs:
  - `tenantId` (Mandanten-UUID) oder `null` (nur echte Plattform-Admins)
  - `isAdmin` (Plattform-Admin; nicht “Tenant-Admin”)
  - `companyRole` (Rolle im Mandanten)
- Hardening:
  - Keine nicht-deterministischen `limit(1)` Reads auf `companies` mehr (verhindert “flapping” bei Reloads/Events)
  - `companies.role=admin` zählt als Tenant-Admin, **nicht** als Plattform-Admin

#### Plattform-Admin Erkennung (`src/lib/profilePlatformAdmin.ts`)

- Plattform-Admin nur, wenn:
  - `profiles.role` normalisiert `admin`
  - **und** kein `tenant_id/mandant_id` gesetzt ist (mandantenlos)

### 3) Kritische APIs (Scope-sensitiv)

- **Team**
  - `GET /api/dashboard/team`
  - Guardrail: niemals “global” ohne echten Plattform-Admin
- **Standorte**
  - `GET/POST /api/dashboard/locations`
  - Manager-like Accounts sind immer auf eigenen Mandanten gescoped (keine URL-Umgehung)
- **Branding**
  - `PATCH /api/dashboard/branding` speichert Branding
  - `GET /api/branding` liefert Branding für eingeloggte Nutzer
  - Hardening: `GET /api/branding` ist `no-store` (verhindert “Branding weg nach Login” durch SWR)

### 4) Smoke-Checks (für Support & Regression)

- **Dashboard Scope**
  - `GET /api/dashboard/diagnostic-scope`
  - Erwartung für Konzern-User: `ok=true`, `scope_matches=true`

### 5) Typische Fehlerbilder & Ursachen

- “Nach F5 sehe ich alle Mandate/Nutzer”
  - Ursache: `tenantId=null` durch falsche Plattform-Admin-Erkennung oder nicht-deterministische Company-Zuordnung
- “Branding weg nach Logout/Login”
  - Ursache: SWR/private caching liefert “leere” Antwort → Lösung: `no-store` für `GET /api/branding`

### 6) Skalierungs-Hinweise (Pilot → Wachstum)

- Team-Listen: Auth-User Listen müssen paginiert werden, sobald Projekte >1000 Users erreichen (Supabase Admin API).
- Datenbank: Indizes auf `profiles.mandant_id`, `locations.company_id`, `branding.tenant_id` prüfen/setzen.
- Realtime: optional; muss Scope-sicher bleiben (Filter `tenant_id=eq.<tenant>`).

