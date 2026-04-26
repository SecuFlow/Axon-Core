-- Reply token for inbound reply detection (provider-agnostic)

alter table public.lead_messages
  add column if not exists reply_token text;

create index if not exists lead_messages_reply_token_idx
  on public.lead_messages (reply_token);

