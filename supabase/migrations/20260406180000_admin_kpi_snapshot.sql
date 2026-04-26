-- KPI Zentrale: performante Aggregation (Admin-only)

create or replace function public.admin_kpi_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nodes_active integer := 0;
  demo_requests_30d integer := 0;
  machines_total integer := 0;
  machines_with_logs integer := 0;
  safeguard_rate numeric := 0;
  axn_volume_30d numeric := 0;
  heat jsonb := '[]'::jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  select count(distinct l.company_id)::int
  into nodes_active
  from public.locations l;

  select count(*)::int
  into demo_requests_30d
  from public.audit_logs a
  where a.action = 'lead.demo_request'
    and a.created_at >= now() - interval '30 days';

  select count(*)::int into machines_total from public.machines;

  select count(distinct ml.machine_id)::int
  into machines_with_logs
  from public.machine_logs ml;

  safeguard_rate :=
    case when machines_total > 0
      then least(1, greatest(0, machines_with_logs::numeric / machines_total::numeric))
      else 0 end;

  select coalesce(sum(abs(t.amount_axn)), 0)
  into axn_volume_30d
  from public.transactions t
  where t.created_at >= now() - interval '30 days';

  -- Heatmap: echte Aktivität aus machine_logs (28 Tage)
  with days as (
    select (current_date - offs)::date as day
    from generate_series(27, 0, -1) as offs
  ),
  counts as (
    select ml.created_at::date as day, count(*)::int as count
    from public.machine_logs ml
    where ml.created_at >= (current_date - 27)::timestamptz
    group by 1
  )
  select jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.count, 0)) order by d.day)
  into heat
  from days d
  left join counts c using (day);

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'network_health_nodes_active', nodes_active,
      'acquisition_velocity_leads_30d', demo_requests_30d,
      'knowledge_safeguard_rate', safeguard_rate,
      'axoncoin_velocity_volume_30d', axn_volume_30d,
      'machines_total', machines_total,
      'machines_with_logs', machines_with_logs
    ),
    'heatmap_28d', coalesce(heat, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_kpi_snapshot() from public;
grant execute on function public.admin_kpi_snapshot() to authenticated;

