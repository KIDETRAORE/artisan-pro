begin;

create table if not exists public.ai_quota (
  user_id uuid primary key,
  monthly_limit integer not null default 100,
  used integer not null default 0,
  reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now()
);

commit;