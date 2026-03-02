-- apps/backend/supabase/migrations/0002_quota_rpcs.sql
-- 0004_indexes_views_guardrails.sql

begin;

-- ============================================================
-- Quota consumption RPC (atomic, monthly reset, concurrency-safe)
-- Signature expected by backend: consume_ai_quota(uid uuid, amt int)
-- ============================================================

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

  -- Lock user quota row
  select q.used, q.monthly_limit, q.reset_at
    into v_used, v_limit, v_reset_at
  from public.ai_quota q
  where q.user_id = uid
  for update;

  -- If no row, create default row (then lock it)
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

  -- Monthly reset if needed
  if now() >= v_reset_at then
    v_used := 0;
    v_new_reset_at := date_trunc('month', now()) + interval '1 month';

    update public.ai_quota
    set used = 0,
        reset_at = v_new_reset_at
    where user_id = uid;

    v_reset_at := v_new_reset_at;
  end if;

  -- Quota exceeded: do NOT write usage
  if v_used + amt > v_limit then
    ok := false;
    used := v_used;
    monthly_limit := v_limit;
    reset_at := v_reset_at;
    return;
  end if;

  -- Consume atomically
    -- Consume atomically (avoid ambiguity with OUT param "used")
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


-- ============================================================
-- 🔔 AUTOMATION RPCs (REMINDERS)  ✅ (MATCH CODE SIGNATURE)
-- ============================================================

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
  -- Take the next overdue invoice that hasn't been reminded recently.
  -- Locking ensures multiple workers won't pick the same invoice.
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
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invoices
  set last_reminder_at = now_ts,
      reminder_count = reminder_count + 1
  where id = invoice_id;
end;
$$;

revoke all on function public.mark_invoice_reminded(uuid, timestamptz) from public;
grant execute on function public.mark_invoice_reminded(uuid, timestamptz) to service_role;


-- ============================================================
-- Indexes utiles
-- ============================================================

create index if not exists idx_ai_logs_user_id on public.ai_logs(user_id);
create index if not exists idx_ai_usage_user_id on public.ai_usage(user_id);
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_invoices_due_date on public.invoices(due_date);
create index if not exists idx_vision_analyses_user_id on public.vision_analyses(user_id);
create index if not exists idx_vision_analyses_project_id on public.vision_analyses(project_id);

-- ✅ Indexes composites recommandés
create index if not exists idx_invoices_user_status_due_date
  on public.invoices (user_id, status, due_date);

create index if not exists idx_vision_analyses_user_created_at
  on public.vision_analyses (user_id, created_at);

create index if not exists idx_subscriptions_user_id
  on public.subscriptions (user_id);

create index if not exists idx_projects_user_created_at
  on public.projects (user_id, created_at);

-- Uniques Stripe ids (évite doublons)
create unique index if not exists subscriptions_stripe_customer_id_uniq
  on public.subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists subscriptions_stripe_subscription_id_uniq
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

-- user_usage: 1 ligne par user & mois
create unique index if not exists user_usage_user_month_uniq
  on public.user_usage(user_id, month_date);

-- View (optionnelle)
create or replace view public.user_usage_view as
select user_id, month_date, analyses_count
from public.user_usage;

-- Guardrail: interdire de diminuer analyses_count
create or replace function public.prevent_decrease_user_usage()
returns trigger
language plpgsql
as $$
begin
  if new.analyses_count < old.analyses_count then
    raise exception 'analyses_count cannot decrease';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_decrease_user_usage on public.user_usage;

create trigger trg_prevent_decrease_user_usage
before update on public.user_usage
for each row
execute function public.prevent_decrease_user_usage();


-- ✅ CHECK constraints (idempotent)
do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'profiles_role_check'
        and connamespace = 'public'::regnamespace
    ) then
      alter table public.profiles
        add constraint profiles_role_check
        check (role in ('user', 'admin'));
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.subscriptions') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'subscriptions_plan_check'
        and connamespace = 'public'::regnamespace
    ) then
      alter table public.subscriptions
        add constraint subscriptions_plan_check
        check (plan in ('free', 'pro'));
    end if;
  end if;
end $$;

do $$
begin
  if to_regclass('public.subscriptions') is not null then
    if not exists (
      select 1 from pg_constraint
      where conname = 'subscriptions_status_check'
        and connamespace = 'public'::regnamespace
    ) then
      alter table public.subscriptions
        add constraint subscriptions_status_check
        check (
          status in ('active', 'trialing', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')
        );
    end if;
  end if;
end $$;


-- ✅ Fix grants for get_user_context(uid uuid) (only if function exists)
do $$
begin
  if to_regprocedure('public.get_user_context(uuid)') is not null then
    execute 'revoke all on function public.get_user_context(uuid) from public';
    execute 'grant execute on function public.get_user_context(uuid) to service_role';
    execute 'grant execute on function public.get_user_context(uuid) to authenticated';
  end if;
end $$;

commit;