-- =========================================
-- RPC: get_dashboard_kpis
-- Reads cached dashboard_stats
-- Fallback: recompute if cache missing
-- =========================================
drop function if exists public.get_dashboard_kpis(uuid);

create function public.get_dashboard_kpis(p_user_id uuid)
returns json
language plpgsql
as $$
declare
  stats record;
  cache_ttl interval := interval '10 seconds';
begin

  -- récupérer cache
  select *
  into stats
  from public.dashboard_stats
  where user_id = p_user_id;

  -- si cache absent
  if stats is null then
    perform public.recompute_dashboard_stats(p_user_id);

    select *
    into stats
    from public.dashboard_stats
    where user_id = p_user_id;

  -- si cache trop ancien
  elsif stats.updated_at < now() - cache_ttl then
    perform public.recompute_dashboard_stats(p_user_id);

    select *
    into stats
    from public.dashboard_stats
    where user_id = p_user_id;
  end if;

  return json_build_object(
    'paid_all_time_cents', coalesce(stats.paid_all_time_cents,0),
    'paid_month_cents', coalesce(stats.paid_month_cents,0),
    'unpaid_total_cents', coalesce(stats.unpaid_total_cents,0),
    'overdue_total_cents', coalesce(stats.overdue_total_cents,0),
    'unpaid_count', coalesce(stats.unpaid_count,0),
    'overdue_count', coalesce(stats.overdue_count,0)
  );

end;
$$;