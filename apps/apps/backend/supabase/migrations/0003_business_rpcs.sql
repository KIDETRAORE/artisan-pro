-- create_ai_quota.sql
-- Table source of truth: public.ai_quota
-- One row per user (user_id PK)

begin;

create table if not exists public.ai_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit integer not null default 100,
  used integer not null default 0,
  reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now()
);

-- Safety constraints
alter table public.ai_quota
  add constraint ai_quota_monthly_limit_nonnegative check (monthly_limit >= 0);

alter table public.ai_quota
  add constraint ai_quota_used_nonnegative check (used >= 0);

-- Optional: speed up queries by reset_at (useful for housekeeping / analytics)
create index if not exists ai_quota_reset_at_idx on public.ai_quota (reset_at);

commit;