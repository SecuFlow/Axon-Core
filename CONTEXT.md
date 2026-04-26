## AxonCore – Code Snapshot (Core Bundle)

### Stack
- Next.js (App Router) + TypeScript
- Supabase (Postgres/Auth/Storage/RLS) + Migrations
- Stripe (Checkout/Subscriptions)
- OpenAI (Lead Research & Outreach Copy)
- ElevenLabs (TTS)

### Wichtige Pfade
- UI (App Router): `src/app`
- API Routes: `src/app/api`
- Shared Logic: `src/lib`
- Components: `src/components`
- DB Migrations: `supabase/migrations`

### Leadmaschine (Kern)
- Cron/Runner: `/api/cron/leadmaschine`
- Admin Steuerung: Admin HQ → Leadmaschine
- Lead APIs: `/api/admin/leads` (inkl. Research/Sequence/Send)

### Performance (aktuell)
- Admin-GET Endpoints nutzen private SWR Cache-Header (`private, stale-while-revalidate`).
- Mehrere Admin-Clients entfernen `no-store`, damit Caching wirken kann.

### Secrets
- Keine `.env` Dateien enthalten.
- Env-Variablen werden nur als Namen angenommen (keine Werte im Bundle).

