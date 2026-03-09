-- 0001_core_tables.sql
-- Baseline DB vide (nouveau projet). Contient toutes les tables + PK/FK/defaults/checks.

begin;

-- Extensions utiles
create extension if not exists pgcrypto;

-- =========================
-- PROFILES (source user-side)
-- =========================
create table public.profiles (
  id uuid primary key, -- doit matcher auth.users.id
  email text not null,
  full_name text,
  company_name text,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

-- =========================
-- SUBSCRIPTIONS (1 row / user)
-- =========================
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan text not null default 'free',
  status text not null default 'active',
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade,

  constraint subscriptions_one_row_per_user
    unique (user_id),

  constraint subscriptions_plan_check
    check (plan in ('free', 'pro')),

  constraint subscriptions_status_check
    check (
      status in (
        'active','trialing','canceled','incomplete','incomplete_expired',
        'past_due','unpaid','paused','inactive','unknown'
      )
    )
);

-- =========================
-- AI_QUOTA (source of truth quota)
-- =========================
create table public.ai_quota (
  user_id uuid primary key,
  monthly_limit integer not null default 100,
  used integer not null default 0,
  reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),

  constraint ai_quota_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade,

  constraint ai_quota_non_negative_check
    check (monthly_limit >= 0 and used >= 0)
);

-- =========================
-- AI_USAGE
-- =========================
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text not null,
  tokens_estimated integer,
  created_at timestamptz not null default now(),

  constraint ai_usage_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade
);

-- =========================
-- AI_LOGS
-- =========================
create table public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature text,
  prompt text,
  response text,
  response_json jsonb,
  status varchar,
  error_message text,
  created_at timestamptz not null default now(),

  constraint ai_logs_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade
);

-- =========================
-- AI_EXPORTS
-- =========================
create table public.ai_exports (
  job_id text primary key default gen_random_uuid()::text,
  user_id uuid not null,
  json_path text not null,
  csv_path text not null,
  created_at timestamptz not null default now(),

  constraint ai_exports_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade
);

-- =========================
-- PROJECTS
-- =========================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  address text,
  created_at timestamptz not null default now(),

  constraint projects_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade
);

-- =========================
-- INVOICES
-- =========================
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_name text not null,
  client_email text,
  total_amount numeric not null,
  status text not null default 'sent',
  due_date timestamptz not null,
  last_reminder_at timestamptz,
  reminder_count integer not null default 0,
  created_at timestamptz not null default now(),

  constraint invoices_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade,

  constraint invoices_amount_positive_check
    check (total_amount >= 0),

  constraint invoices_reminder_count_non_negative_check
    check (reminder_count >= 0)
);

-- =========================
-- STRIPE_EVENTS
-- =========================
create table public.stripe_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- =========================
-- USER_USAGE (monthly counters)
-- =========================
create table public.user_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  month_date date not null,
  analyses_count integer not null default 0,
  created_at timestamptz not null default now(),

  constraint user_usage_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade,

  constraint user_usage_analyses_non_negative_check
    check (analyses_count >= 0)
);

-- =========================
-- VISION_ANALYSES
-- =========================
create table public.vision_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid,
  analysis jsonb not null,
  confidence numeric,
  original_size integer,
  sanitized_size integer,
  created_at timestamptz not null default now(),

  constraint vision_analyses_user_fk
    foreign key (user_id) references public.profiles(id) on delete cascade,

  constraint vision_analyses_project_fk
    foreign key (project_id) references public.projects(id) on delete set null
);

-- ============================================================
-- ✅ MODIF DEMANDÉE: auto-provision profile/subscription/quota
-- ============================================================

-- 1) Function qui crée la ligne profiles lors d’un signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name, role, created_at)
  values (new.id, new.email, null, 'user', now())
  on conflict (id) do nothing;

  -- Optionnel: créer subscription FREE
  insert into public.subscriptions (user_id, plan, status, created_at, updated_at)
  values (new.id, 'free', 'active', now(), now())
  on conflict (user_id) do nothing;

  -- Optionnel: créer quota row
  insert into public.ai_quota (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

commit;