# Leadmaschine ↔ Gmail verbinden (Warmlauf-Anleitung)

Ziel: Die Leadmaschine so weit live schalten, dass
- der Button **„Gmail Test"** grün durchläuft,
- der Button **„Runner jetzt"** echte Outreach-Mails über dein Gmail verschickt,
- und du das Ganze schon beobachten kannst, bevor Pub/Sub (automatische Reply-Erkennung) eingerichtet ist.

Pub/Sub ist für den Warmlauf **nicht zwingend** — du kannst Replies am Anfang manuell im Sekretär-Modul verarbeiten.

---

## 0) Architektur-Kurzüberblick (damit du weißt, was wo passiert)

| Komponente | Datei | Zweck |
|---|---|---|
| OAuth-Wrapper | `src/lib/gmailClient.server.ts` | Baut aus den ENVs den authentifizierten `google.gmail`-Client. |
| Dry-Run / Health-Check | `src/app/api/admin/leadmaschine/gmail/test/route.ts` | Button „Gmail Test". Prüft OAuth + Profil + (falls Watch existiert) History-Cursor. |
| Watch aktivieren | `src/app/api/admin/leadmaschine/gmail/watch/route.ts` | Button „Gmail Watch". Registriert Pub/Sub-Topic → setzt `gmail_sync_state.last_history_id`. |
| Push-Webhook (Replies) | `src/app/api/gmail/push/route.ts` | Empfängt Pub/Sub-Events, matched `reply_token`-Marker, verknüpft Antworten mit Leads. |
| Outreach-Versand | `src/app/api/admin/leads/[id]/send/route.ts` + `src/lib/leadmaschineRunner.server.ts` | `gmail.users.messages.send` über das verbundene Konto. |
| Einstellungen | Tabelle `leadmaschine_settings` (Migrationen 20260406*, 20260416*) | Throttle, Leads pro Tag/Monat, Mindestabstand Gmail-Sends. |

---

## 1) Gmail-Konto vorbereiten (persönliches Konto, erster Test)

> ⚠️ **Wichtig:** Du hast gesagt, du willst erstmal dein normales Gmail nutzen. Das geht technisch, aber achte auf:
> - Google drosselt auf ~500 Mails/Tag bei Free-Accounts (Workspace: ~2000).
> - Deine Privat-Mails landen in derselben Inbox wie Lead-Replies. Filter/Label dringend empfohlen.
> - Reverse-DNS/SPF/DKIM sind nicht unter deiner Kontrolle → Spam-Score höher als bei einer eigenen Domain.
> - **Vor Live-Betrieb** dringend auf dedizierte Adresse umstellen (`leadmaschine@deine-domain.at` über Google Workspace).

**Minimalsetup für den Warmlauf:**

1. Login in dein Gmail.
2. Einmalig ein Label `Axon Leadmaschine` anlegen (Einstellungen → Labels → Neu).
3. Filter: `has:the-words "AX-" from:*` → Label `Axon Leadmaschine` + „Posteingang überspringen" **NICHT** anhaken (wir wollen sie sehen).
4. In **Gmail-Einstellungen → Weiterleitung & POP/IMAP → IMAP: Aktivieren** (Pub/Sub nutzt das nicht, aber schadet nicht).

---

## 2) OAuth-Scopes deines Refresh-Tokens prüfen

Dein Refresh-Token **muss** diese Scopes abdecken, sonst schlägt der Versand fehl:

```text
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.metadata    (für History-Dry-Run)
https://www.googleapis.com/auth/gmail.modify      (nur wenn du später Labels setzen willst)
```

### Scopes deines aktuellen Tokens testen

Schnellcheck in PowerShell — ersetzt `DEIN_REFRESH_TOKEN`, `DEIN_CLIENT_ID`, `DEIN_CLIENT_SECRET`:

```powershell
$body = @{
  client_id     = "DEIN_CLIENT_ID"
  client_secret = "DEIN_CLIENT_SECRET"
  refresh_token = "DEIN_REFRESH_TOKEN"
  grant_type    = "refresh_token"
}
$resp = Invoke-RestMethod -Method Post -Uri "https://oauth2.googleapis.com/token" -Body $body
$resp | ConvertTo-Json
Invoke-RestMethod -Uri "https://oauth2.googleapis.com/tokeninfo?access_token=$($resp.access_token)"
```

Die Antwort muss im Feld `scope` `gmail.send` enthalten. Wenn nicht → **neuen Refresh-Token holen** (siehe unten).

### Neuen Refresh-Token holen (falls Scopes fehlen)

Am schnellsten über den **OAuth 2.0 Playground**:

1. Öffne https://developers.google.com/oauthplayground
2. Oben rechts Zahnrad → **Use your own OAuth credentials** → deine `CLIENT_ID` / `CLIENT_SECRET` eintragen.
3. Links im Scope-Feld manuell eintragen (komma- oder newline-getrennt):
   ```
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.metadata
   https://www.googleapis.com/auth/gmail.modify
   ```
4. **Authorize APIs** → mit deinem Gmail-Konto einloggen → alle Scopes zustimmen.
5. **Exchange authorization code for tokens** → den `refresh_token` kopieren.
6. **Wichtig:** Voraussetzung dafür, dass das Token „offline" gültig bleibt:
   - Im **Google Cloud Console → APIs & Services → OAuth consent screen** muss der Publish-Status entweder **„In Produktion"** sein **oder** dein Gmail als Testuser eingetragen sein (sonst läuft das Token nach 7 Tagen ab).
   - App-Typ muss **„External"** sein (wenn du kein Workspace-interner User bist).
7. In der **Cloud Console → APIs & Services → Bibliothek** muss die **Gmail API** aktiviert sein.

---

## 3) ENV-Variablen setzen

### Lokal (Next.js Dev)

Datei `.env.local` im Repo-Root (wird nicht committet — prüfe `.gitignore`):

```bash
# Google OAuth für Leadmaschine-Gmail
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_REFRESH_TOKEN=1//0g-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Dein persönliches Gmail — muss mit dem OAuth-Konto identisch sein,
# sonst bricht /api/admin/leadmaschine/gmail/test mit 409 ab.
GMAIL_USER_EMAIL=deine-adresse@gmail.com

# Pub/Sub — erstmal leerlassen. Nur für „Gmail Watch" nötig.
# GMAIL_PUBSUB_TOPIC=projects/axoncore-xxx/topics/gmail-inbound
```

Server neu starten (`npm run dev`), die ENVs greifen sonst nicht.

### Produktion (Vercel)

Vercel Dashboard → Projekt → **Settings → Environment Variables**:

| Key | Environments |
|---|---|
| `GOOGLE_CLIENT_ID` | Production, Preview, Development |
| `GOOGLE_CLIENT_SECRET` | Production, Preview, Development |
| `GOOGLE_REFRESH_TOKEN` | Production, Preview, Development |
| `GMAIL_USER_EMAIL` | Production, Preview, Development |

Danach einmal **Redeploy** auslösen (Deployments → … → Redeploy), damit die neuen ENVs im Build sind.

---

## 4) Datenbank-Migrationen pushen

Wenn du noch nie alle Leadmaschine-Migrationen gepusht hast, jetzt nachziehen — sonst kommt die Meldung „Leadmaschine-Settings-Tabelle fehlt":

```powershell
supabase db push
```

Erwartete (heute relevante) Migrationen:

- `20260406110000_leadmaschine.sql` — Leads/Lead-Messages Basis
- `20260406114000_leadmaschine_settings.sql` — Settings-Tabelle
- `20260406124500_gmail_sync_state.sql` — `last_history_id` für Watch
- `20260406170000_leadmaschine_live_send.sql` — Live-Send-Erweiterungen
- `20260406203000_leadmaschine_settings_per_segment.sql` — Enterprise/SMB-Limits
- `20260416140000_leadmaschine_daily_gmail_throttle.sql` — Tages-Limits & Gmail-Mindestabstand

Falls `supabase db push` sagt „No migrations to apply", ist schon alles da — dann ist der 503-Fehler im Test ein ENV-Problem, kein Migrationsproblem.

---

## 5) Warmlauf durchführen (Reihenfolge!)

1. **Admin HQ → Leadmaschine** öffnen.
2. Button **„Gmail Test"** klicken.
   - Erwartete Antwort (Status-Zeile unter den Buttons):
     ```
     Gmail OK · Konto: deine-adresse@gmail.com · Postfach-Nachrichten: 12345. OAuth und Postfach-Zugriff sind in Ordnung. Für History-/Reply-Tests bitte einmal „Gmail Watch" ausführen (setzt historyId-Cursor).
     ```
   - Phase `oauth_only` heißt: **alles grün für den Versand**, nur Reply-Erkennung steht noch nicht.
3. Einstellungen prüfen: **Leads pro Tag Enterprise/SMB** und **Mindestabstand Gmail-Sends** (Sekunden). Für den ersten Warmlauf empfehle ich:
   - `leads_per_day_enterprise = 2`
   - `leads_per_day_smb = 1`
   - `max_actions_per_run_enterprise = 2`
   - `max_actions_per_run_smb = 1`
   - `min_seconds_between_gmail_sends = 180` (3 Min. zwischen Mails — Anti-Spam)
4. **Einen Test-Lead manuell anlegen** (eigene Zweit-Adresse als Empfänger), Status auf „queued" / ready-to-send.
5. Button **„Runner jetzt"** klicken.
6. Deine Inbox prüfen: Testmail muss angekommen sein, im Body ein Marker wie `AX-xxxxxxxx` (reply_token).
7. Auf die Testmail antworten — solange Pub/Sub nicht aktiv ist, landet der Match nicht automatisch. Das erledigst du später mit Schritt 6.

---

## 6) (Optional, später) Pub/Sub für automatische Reply-Erkennung

Erst einrichten, wenn Schritt 5 stabil läuft.

1. **Google Cloud Console → Pub/Sub → Topics** → `CREATE TOPIC`, Name z. B. `gmail-inbound`.
2. Bei dem Topic **Permissions** → `gmail-api-push@system.gserviceaccount.com` als **Pub/Sub Publisher** berechtigen (genau dieser Service-Account, sonst verweigert Gmail `users.watch`).
3. **Subscriptions** → `CREATE SUBSCRIPTION` auf dem Topic:
   - Delivery Type: **Push**
   - Endpoint URL: `https://<deine-vercel-domain>/api/gmail/push`
   - Authentication: **Enable authentication**, Service-Account mit `roles/iam.serviceAccountTokenCreator` (Google signiert die Requests).
4. In Vercel ENV setzen:
   ```
   GMAIL_PUBSUB_TOPIC=projects/<gcp-project-id>/topics/gmail-inbound
   ```
5. Redeploy.
6. In der Leadmaschine-UI: Button **„Gmail Watch"** klicken. Erwartete Antwort:
   ```
   Gmail Watch aktiv. Inbox: deine-adresse@gmail.com · Expiration: 1719...
   ```
7. Ab jetzt triggern eingehende Mails den Push-Webhook; `reply_token`-Matches werden automatisch als `lead_reply` in `lead_messages` eingetragen.

> `users.watch` läuft **alle 7 Tage** ab. Cron-Job (`/api/cron/leadmaschine` oder neuer Cron für Watch) muss regelmäßig erneuern — das ist im aktuellen Stand noch **nicht** automatisiert und Teil der nächsten Ausbaustufe.

---

## 7) Troubleshooting

| Fehlermeldung in der UI | Ursache | Fix |
|---|---|---|
| „Netzwerkfehler." | Fetch geworfen Exception (CORS/Offline) oder Route hat 500 geworfen ohne JSON | DevTools → Network → Response des Calls prüfen. Meist ENV fehlt → `.env.local`/Vercel prüfen + Server-Neustart. |
| „Google OAuth fehlt: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN." | ENVs nicht geladen | Server neu starten, Vercel Redeploy, Key-Schreibweise prüfen (keine Leerzeichen). |
| „GMAIL_USER_EMAIL (x) weicht von OAuth-Konto (y) ab." | ENV-Adresse ≠ Konto des Refresh-Tokens | `GMAIL_USER_EMAIL` anpassen **oder** neuen Token mit dem korrekten Konto holen. |
| „Leadmaschine-Settings-Tabelle fehlt." | Migration nicht gepusht | `supabase db push` im Repo-Root. |
| `insufficient authentication scopes` beim Versand | Refresh-Token hat `gmail.send` nicht | Neuen Token über OAuth Playground mit allen Scopes aus Schritt 2 holen. |
| `GMAIL_PUBSUB_TOPIC fehlt` beim Watch | ENV nicht gesetzt | Für den Warmlauf irrelevant — Watch überspringen. |
| „Cursor evtl. zu alt" im Test | `last_history_id` älter als 7 Tage | „Gmail Watch" erneut ausführen (setzt Cursor zurück). |

---

## 8) Sicherheits-/DSGVO-Hinweise für den Produktivbetrieb

Bevor die Leadmaschine mit echten Kundendaten Mails raushaut:

- [ ] Dedizierte Domain-Adresse (`leadmaschine@axoncore.at`) statt privatem Gmail.
- [ ] SPF + DKIM + DMARC im DNS gesetzt (Google Workspace Admin → Gmail → Authentifizierung).
- [ ] Impressum + Double-Opt-Out in Mail-Templates (Artikel 14 DSGVO + § 7 UWG bei Kaltakquise).
- [ ] Auftragsverarbeitung (AVV) mit Google abschließen (Workspace-Dashboard).
- [ ] Rate-Limit konservativ (Enterprise ≤ 5/Tag, SMB ≤ 2/Tag) bis Reputation aufgebaut.
- [ ] Supabase-Backup-Cron (`/api/cron/backup`) aktiv und überwacht.
