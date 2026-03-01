-- apps/backend/supabase/migrations/20260302120000_create_get_user_context_rpc.sql

create or replace function public.get_user_context(uid uuid)
returns table (
  full_name text,
  company_name text,
  plan text,
  status text
)
language sql
security definer
as $$
  select
    p.full_name,
    p.company_name,
    coalesce(s.plan, 'free') as plan,
    coalesce(s.status, 'active') as status
  from public.profiles p
  left join public.subscriptions s on s.user_id = p.id
  where p.id = uid
  limit 1;
$$;

revoke all on function public.get_user_context(uuid) from public;