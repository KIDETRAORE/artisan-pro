-- 2026-02-28_add_subscriptions_stripe_fields.sql
-- Align DB schema with backend code usage for public.subscriptions

begin;

-- Add missing Stripe fields (idempotent)
alter table public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz;

-- Ensure created_at exists
alter table public.subscriptions
  add column if not exists created_at timestamptz;

-- Optional but useful: updated_at
alter table public.subscriptions
  add column if not exists updated_at timestamptz;

-- Backfill created_at if null
update public.subscriptions
set created_at = now()
where created_at is null;

-- updated_at trigger (safe)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;

create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

-- Plan normalization constraint (safe version)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_plan_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_check
      check (plan in ('free','pro'));
  end if;
end
$$;

-- Useful indexes
create unique index if not exists subscriptions_user_id_uniq
  on public.subscriptions(user_id);

create index if not exists subscriptions_stripe_customer_id_idx
  on public.subscriptions(stripe_customer_id);

create index if not exists subscriptions_stripe_subscription_id_idx
  on public.subscriptions(stripe_subscription_id);

commit;