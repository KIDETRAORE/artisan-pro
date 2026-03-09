begin;

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

  update public.ai_quota as q
  set used = q.used + amt
  where q.user_id = uid
  returning q.used, q.monthly_limit, q.reset_at
  into used, monthly_limit, reset_at;

  ok := true;
  return;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, int) from public;
grant execute on function public.consume_ai_quota(uuid, int) to authenticated;
grant execute on function public.consume_ai_quota(uuid, int) to service_role;

commit;