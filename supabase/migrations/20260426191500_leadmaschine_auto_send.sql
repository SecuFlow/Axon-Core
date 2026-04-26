-- Leadmaschine Auto-Send: Master-Switch + Lead-Sperre + Audit-Felder.
--
-- Vorher: runLeadmaschine bereitet nur Drafts vor (lead_outreach_events.status = 'prepared'),
-- der tatsächliche Gmail-Versand passiert manuell über /api/admin/leads/[id]/send.
--
-- Mit dieser Migration kann der Cron-Runner Mails optional automatisch über Gmail
-- versenden, sobald (a) leadmaschine_settings.auto_send_enabled = true UND
-- (b) keiner der hartkodierten Generic-Mailbox-Blocks (info@/kontakt@/...) zutrifft.
--
-- Default: FALSE — nach der Migration ändert sich operativ NICHTS, bis der Master-Switch
-- bewusst im HQ-UI eingeschaltet wird.

alter table public.leadmaschine_settings
  add column if not exists auto_send_enabled boolean not null default false;

comment on column public.leadmaschine_settings.auto_send_enabled is
  'Master-Switch: wenn true, sendet runLeadmaschine vorbereitete Outreach-Mails sofort über Gmail. Generic-Mailboxen (info@/kontakt@/etc.) werden hardcoded geblockt. Default false (manueller Review-Flow).';

-- Optionaler Pro-Lead Stop: einzelne Leads dauerhaft vom Auto-Send ausschließen,
-- ohne sie zu disqualifizieren (z. B. juristisch sensible Konzerne).
alter table public.leads
  add column if not exists auto_send_blocked boolean not null default false;

comment on column public.leads.auto_send_blocked is
  'Wenn true: dieser Lead wird vom Auto-Send-Runner übersprungen (Mail bleibt Draft). Manueller Versand über HQ bleibt möglich.';

create index if not exists leads_auto_send_blocked_idx
  on public.leads (auto_send_blocked)
  where auto_send_blocked = true;
