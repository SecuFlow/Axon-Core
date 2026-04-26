-- Leadmaschine Live Versand (Gmail): minimaler Ausbau, non-destruktiv

alter table public.leads
  add column if not exists contact_email text;

alter table public.lead_messages
  add column if not exists sent_at timestamptz,
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text,
  add column if not exists to_email text;

create index if not exists lead_messages_sent_at_idx on public.lead_messages (sent_at desc);

