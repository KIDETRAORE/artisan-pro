create or replace function public.get_dashboard_kpis(p_user_id uuid)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'paid_all_time_cents',
      coalesce(sum(total_amount_cents)
        filter (where status = 'paid'),0),

    'paid_month_cents',
      coalesce(sum(total_amount_cents)
        filter (
          where status = 'paid'
          and created_at >= date_trunc('month', now())
        ),0),

    'unpaid_total_cents',
      coalesce(sum(total_amount_cents)
        filter (where status in ('sent','overdue')),0),

    'overdue_total_cents',
      coalesce(sum(total_amount_cents)
        filter (
          where status in ('sent','overdue')
          and due_date < now()
        ),0),

    'unpaid_count',
      count(*) filter (where status in ('sent','overdue')),

    'overdue_count',
      count(*) filter (
        where status in ('sent','overdue')
        and due_date < now()
      )
  )
  into result
  from public.invoices
  where user_id = p_user_id;

  return result;
end;
$$;