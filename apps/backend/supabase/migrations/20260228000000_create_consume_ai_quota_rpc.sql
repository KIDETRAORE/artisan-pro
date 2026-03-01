-- 2026-02-28_create_consume_ai_quota_rpc.sql
-- Source of truth quota consumption (atomic) via public.consume_ai_quota(uid, amt)

begin;

create or replace function public.consume_ai_quota(uid uuid, amt integer)
returns table(ok boolean, used integer, monthly_limit integer, reset_at timestamptz)
language plpgsql
as $$
declare
  v_used integer;
  v_limit integer;
  v_reset_at timestamptz;
  v_now timestamptz := now();
begin
  -- ✅ AJOUT (self-contained): garantit la row quota avant toute lecture/lock
  perform public.ensure_ai_quota(uid);

  if uid is null or amt is null or amt < 1 then
    -- invalid input
    ok := false;
    used := null;
    monthly_limit := null;
    reset_at := null;
    return next;
    return;
  end if;

  -- Lock row for atomic update
  select q.used, q.monthly_limit, q.reset_at
    into v_used, v_limit, v_reset_at
  from public.ai_quota q
  where q.user_id = uid
  for update;

  -- If no row exists, create a default row (safe fallback)
  if not found then
    insert into public.ai_quota (user_id, monthly_limit, used, reset_at, created_at)
    values (uid, 20, 0, date_trunc('month', v_now) + interval '1 month', v_now);

    select q.used, q.monthly_limit, q.reset_at
      into v_used, v_limit, v_reset_at
    from public.ai_quota q
    where q.user_id = uid
    for update;
  end if;

  -- Monthly reset if needed
  if v_reset_at is null or v_now >= v_reset_at then
    v_used := 0;
    v_reset_at := date_trunc('month', v_now) + interval '1 month';

    update public.ai_quota
      set used = v_used,
          reset_at = v_reset_at
    where user_id = uid;
  end if;

  -- Refuse if over limit
  if (v_used + amt) > v_limit then
    ok := false;
    used := v_used;
    monthly_limit := v_limit;
    reset_at := v_reset_at;
    return next;
    return;
  end if;

  -- Consume
  v_used := v_used + amt;

  update public.ai_quota
    set used = v_used
  where user_id = uid;

  ok := true;
  used := v_used;
  monthly_limit := v_limit;
  reset_at := v_reset_at;
  return next;
end;
$$;

commit;