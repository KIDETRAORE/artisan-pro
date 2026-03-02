begin;

-- =========================
-- Quota RPC
-- =========================
drop function if exists public.consume_ai_quota(uuid, integer);
drop function if exists public.consume_ai_quota(integer, uuid);

create or replace function public.consume_ai_quota(uid uuid, amt int)
returns table (ok boolean, used int, monthly_limit int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_limit int;
  v_reset_at timestamptz;
  v_new_reset_at timestamptz;
begin
  if amt is null or amt <= 0 then
    raise exception 'amt must be > 0';
  end if;

  select q.used, q.monthly_limit, q.reset_at
    into v_used, v_limit, v_reset_at
  from public.ai_quota q
  where q.user_id = uid
  for update;

  if not found then
    insert into public.ai_quota (user_id)
    values (uid)
    on conflict (user_id) do nothing;

    select q.used, q.monthly_limit, q.reset_at
      into v_used, v_limit, v_reset_at
    from public.ai_quota q
    where q.user_id = uid
    for update;
  end if;

  if now() >= v_reset_at then
    v_used := 0;
    v_new_reset_at := date_trunc('month', now()) + interval '1 month';

    update public.ai_quota
    set used = 0,
        reset_at = v_new_reset_at
    where user_id = uid;

    v_reset_at := v_new_reset_at;
  end if;

  if v_used + amt > v_limit then
    ok := false;
    used := v_used;
    monthly_limit := v_limit;
    reset_at := v_reset_at;
    return;
  end if;

  update public.ai_quota
  set used = used + amt
  where user_id = uid
  returning public.ai_quota.used, public.ai_quota.monthly_limit, public.ai_quota.reset_at
  into used, monthly_limit, reset_at;

  ok := true;
  return;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, int) from public;
grant execute on function public.consume_ai_quota(uuid, int) to authenticated;
grant execute on function public.consume_ai_quota(uuid, int) to service_role;

-- =========================
-- Reminders RPCs (match code)
-- =========================
drop function if exists public.take_next_invoice_to_remind(timestamptz, int);

create or replace function public.take_next_invoice_to_remind(
  now_ts timestamptz,
  cooldown_days int
)
returns table (
  invoice_id uuid,
  user_id uuid,
  client_name text,
  client_email text,
  total_amount numeric,
  due_date timestamptz,
  reminder_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    i.id as invoice_id,
    i.user_id,
    i.client_name,
    i.client_email,
    i.total_amount,
    i.due_date,
    i.reminder_count
  from public.invoices i
  where i.status = 'sent'
    and i.due_date < now_ts
    and (
      i.last_reminder_at is null
      or i.last_reminder_at < (now_ts - make_interval(days => greatest(coalesce(cooldown_days, 1), 0)))
    )
  order by i.due_date asc
  limit 1
  for update skip locked;
end;
$$;

revoke all on function public.take_next_invoice_to_remind(timestamptz, int) from public;
grant execute on function public.take_next_invoice_to_remind(timestamptz, int) to service_role;

drop function if exists public.mark_invoice_reminded(uuid, timestamptz);

create or replace function public.mark_invoice_reminded(
  invoice_id uuid,
  now_ts timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invoices
  set
    last_reminder_at = now_ts,
    reminder_count = coalesce(reminder_count, 0) + 1
  where id = invoice_id;
$$;

revoke all on function public.mark_invoice_reminded(uuid, timestamptz) from public;
grant execute on function public.mark_invoice_reminded(uuid, timestamptz) to service_role;

commit;