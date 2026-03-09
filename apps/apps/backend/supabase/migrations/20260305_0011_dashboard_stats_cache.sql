-- =========================================
-- Dashboard stats cache (instant dashboard)
-- - Table: dashboard_stats (1 row per user)
-- - Function: recompute_dashboard_stats(user)
-- - Triggers on invoices (insert/update/delete)
-- =========================================

-- 1) Table cache
create table if not exists public.dashboard_stats (
  user_id uuid primary key,
  paid_all_time_cents bigint not null default 0,
  paid_month_cents bigint not null default 0,
  unpaid_total_cents bigint not null default 0,
  overdue_total_cents bigint not null default 0,
  unpaid_count int not null default 0,
  overdue_count int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_dashboard_stats_updated_at
  on public.dashboard_stats (updated_at desc);

-- 2) Recompute function (source of truth = invoices.*_cents + status)
create or replace function public.recompute_dashboard_stats(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  month_start timestamptz := date_trunc('month', now());
begin
  insert into public.dashboard_stats as ds (
    user_id,
    paid_all_time_cents,
    paid_month_cents,
    unpaid_total_cents,
    overdue_total_cents,
    unpaid_count,
    overdue_count,
    updated_at
  )
  select
    p_user_id as user_id,

    -- Paid all-time
    coalesce(sum(case when lower(i.status) = 'paid' then coalesce(i.total_amount_cents, 0) else 0 end), 0) as paid_all_time_cents,

    -- Paid this month (kept consistent with your previous logic: created_at in current month + status paid)
    coalesce(sum(case
      when lower(i.status) = 'paid' and i.created_at >= month_start
      then coalesce(i.total_amount_cents, 0)
      else 0
    end), 0) as paid_month_cents,

    -- Unpaid total (sent + overdue)
    coalesce(sum(case
      when lower(i.status) in ('sent', 'overdue')
      then coalesce(i.total_amount_cents, 0)
      else 0
    end), 0) as unpaid_total_cents,

    -- Overdue total (sent/overdue and due_date < now)
    coalesce(sum(case
      when lower(i.status) in ('sent', 'overdue') and i.due_date < now()
      then coalesce(i.total_amount_cents, 0)
      else 0
    end), 0) as overdue_total_cents,

    -- Counts
    coalesce(sum(case when lower(i.status) in ('sent', 'overdue') then 1 else 0 end), 0)::int as unpaid_count,
    coalesce(sum(case when lower(i.status) in ('sent', 'overdue') and i.due_date < now() then 1 else 0 end), 0)::int as overdue_count,

    now() as updated_at
  from public.invoices i
  where i.user_id = p_user_id
  on conflict (user_id) do update
    set paid_all_time_cents = excluded.paid_all_time_cents,
        paid_month_cents    = excluded.paid_month_cents,
        unpaid_total_cents  = excluded.unpaid_total_cents,
        overdue_total_cents = excluded.overdue_total_cents,
        unpaid_count        = excluded.unpaid_count,
        overdue_count       = excluded.overdue_count,
        updated_at          = excluded.updated_at;
end;
$$;

-- 3) Trigger function on invoices
create or replace function public.trg_invoices_recompute_dashboard_stats()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_dashboard_stats(old.user_id);
    return old;
  else
    perform public.recompute_dashboard_stats(new.user_id);
    return new;
  end if;
end;
$$;

drop trigger if exists invoices_recompute_dashboard_stats on public.invoices;

create trigger invoices_recompute_dashboard_stats
after insert or update or delete on public.invoices
for each row
execute function public.trg_invoices_recompute_dashboard_stats();

-- 4) Backfill: init stats for existing users (optional but recommended)
insert into public.dashboard_stats (user_id)
select distinct user_id from public.invoices
on conflict do nothing;

do $$
declare r record;
begin
  for r in (select user_id from public.dashboard_stats) loop
    perform public.recompute_dashboard_stats(r.user_id);
  end loop;
end $$;