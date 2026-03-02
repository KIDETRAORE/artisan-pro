-- Repair: ensure_ai_quota + set_ai_quota_limit (idempotent)
create or replace function public.ensure_ai_quota(uid uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.ai_quota (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  update public.ai_quota
  set reset_at = (date_trunc('month', now()) + interval '1 month')
  where user_id = uid
    and reset_at < now();
end;
$$;

create or replace function public.set_ai_quota_limit(uid uuid, new_limit int)
returns void
language plpgsql
security definer
as $$
begin
  if new_limit < 0 then
    raise exception 'new_limit must be >= 0';
  end if;

  perform public.ensure_ai_quota(uid);

  update public.ai_quota
  set monthly_limit = new_limit
  where user_id = uid;
end;
$$;

-- lock down: not public, but usable by backend service role
revoke all on function public.ensure_ai_quota(uuid) from public;
revoke all on function public.set_ai_quota_limit(uuid, int) from public;

grant execute on function public.ensure_ai_quota(uuid) to service_role;
grant execute on function public.set_ai_quota_limit(uuid, int) to service_role;