-- Demo-Ansicht: optionales Upgrade-Banner (global pro Firma, HQ steuerbar)
alter table public.companies
  add column if not exists demo_show_upgrade_cta boolean not null default true;

comment on column public.companies.demo_show_upgrade_cta is
  'Wenn true (Default): Im Gast-Demo-Modus den CTA „Jetzt vollen Zugriff anfordern“ anzeigen.';
