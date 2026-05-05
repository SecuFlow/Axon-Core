-- Stripe-Webhook Idempotency: jede Stripe-Event-ID darf nur EINMAL verarbeitet werden.
--
-- Hintergrund: Stripe wiederholt Webhooks aggressiv, bis 200 OK zurückkommt.
-- Ohne Sperrtabelle laufen Provisioning-Jobs (Wallet, companies-Update, Mandat,
-- Welcome-Mail) mehrfach pro Zahlung. Diese Tabelle dient als deduplizierender
-- Lock: der Webhook versucht zuerst INSERT auf event_id und führt nur dann
-- die teure Logik aus, wenn der INSERT erfolgreich war.

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'processing', 'completed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  error_text text
);

comment on table public.stripe_events is
  'Idempotency-Log für eingehende Stripe-Webhooks. PK = stripe event.id verhindert Doppelverarbeitung bei Retries.';
comment on column public.stripe_events.status is
  'received → processing → completed | failed. Bei completed/failed wird der Event übersprungen.';

create index if not exists stripe_events_received_at_idx
  on public.stripe_events (received_at desc);

create index if not exists stripe_events_status_idx
  on public.stripe_events (status)
  where status in ('processing', 'failed');

alter table public.stripe_events enable row level security;

-- Nur Service-Role schreibt/liest direkt (ohne RLS-Policy bleibt die Tabelle
-- für Anon/Authenticated unsichtbar — Service-Role umgeht RLS sowieso).

notify pgrst, 'reload schema';
