-- Öffentliches Website-Team: Anzeige-Titel getrennt von interner Rolle (admin/mitarbeiter/manager)

alter table if exists public.team_members
  add column if not exists public_title text;

comment on column public.team_members.public_title is
  'Öffentliche Berufs-/Funktionsbezeichnung auf der Website; team_members.role bleibt die interne Mandanten-Rolle.';
