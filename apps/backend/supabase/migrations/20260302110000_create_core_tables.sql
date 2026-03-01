-- apps/backend/supabase/migrations/20260302110000_create_core_tables.sql
--
-- Core tables baseline aligned with the provided "real DB" table/column list.
-- Goal: supabase db reset/push can recreate the schema deterministically.

-- ============================================================
-- 0) Extensions used by defaults
-- ============================================================
create extension if not exists pgcrypto;

-- ============================================================
-- 1) PROFILES
-- ============================================================
create table if not exists public.profiles (
  id uuid not null,
  full_name text null,
  company_name text null,
  role text not null default 'user'::text,
  created_at timestamptz not null default now(),
  email text not null,
  constraint profiles_pkey primary key (id)
);

-- ============================================================
-- 2) SUBSCRIPTIONS
-- ============================================================
create table if not exists public.subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  plan text not null default 'free'::text,
  status text not null default 'active'::text,
  current_period_end timestamptz null,
  created_at timestamptz not null default now(),
  stripe_customer_id text null,
  stripe_subscription_id text null,
  updated_at timestamptz null default now(),
  constraint subscriptions_pkey primary key (id)
);

-- ============================================================
-- 3) AI_QUOTA
-- ============================================================
create table if not exists public.ai_quota (
  user_id uuid not null,
  monthly_limit integer not null default 100,
  used integer not null default 0,
  reset_at timestamptz not null default (date_trunc('month'::text, now()) + '1 mon'::interval),
  created_at timestamptz not null default now(),
  constraint ai_quota_pkey primary key (user_id)
);

-- ============================================================
-- 4) AI_USAGE
-- ============================================================
create table if not exists public.ai_usage (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  feature text not null,
  tokens_estimated integer null,
  created_at timestamptz not null default now(),
  constraint ai_usage_pkey primary key (id)
);

-- ============================================================
-- 5) AI_LOGS
-- ============================================================
create table if not exists public.ai_logs (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  prompt text null,
  response text null,
  status character varying null,
  error_message text null,
  created_at timestamptz null default now(),
  feature text null,
  response_json jsonb null,
  constraint ai_logs_pkey primary key (id)
);

-- ============================================================
-- 6) AI_EXPORTS
-- ============================================================
create table if not exists public.ai_exports (
  job_id text not null default (gen_random_uuid())::text,
  user_id uuid not null,
  json_path text not null,
  csv_path text not null,
  created_at timestamptz not null default now(),
  constraint ai_exports_pkey primary key (job_id)
);

-- ============================================================
-- 7) PROJECTS
-- ============================================================
create table if not exists public.projects (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  address text null,
  created_at timestamptz null default now(),
  constraint projects_pkey primary key (id)
);

-- ============================================================
-- 8) INVOICES
-- ============================================================
create table if not exists public.invoices (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  client_name text not null,
  client_email text null,
  total_amount numeric not null,
  status text null default 'sent'::text,
  due_date timestamptz not null,
  last_reminder_at timestamptz null,
  reminder_count integer null default 0,
  created_at timestamptz null default now(),
  constraint invoices_pkey primary key (id)
);

-- ============================================================
-- 9) STRIPE_EVENTS
-- ============================================================
create table if not exists public.stripe_events (
  id text not null,
  type text not null,
  created_at timestamptz null default now(),
  processed_at timestamptz null,
  constraint stripe_events_pkey primary key (id)
);

-- ============================================================
-- 10) USER_USAGE
-- ============================================================
create table if not exists public.user_usage (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  analyses_count integer not null default 0,
  created_at timestamptz not null default now(),
  month_date date not null,
  constraint user_usage_pkey primary key (id)
);

-- ============================================================
-- 11) USER_USAGE_VIEW
-- ============================================================
create or replace view public.user_usage_view as
select
  uu.user_id,
  uu.month_date,
  uu.analyses_count
from public.user_usage uu;

-- ============================================================
-- 12) VISION_ANALYSES
-- ============================================================
create table if not exists public.vision_analyses (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid null,
  analysis jsonb not null,
  confidence numeric null,
  original_size integer null,
  sanitized_size integer null,
  created_at timestamptz null default now(),
  constraint vision_analyses_pkey primary key (id)
);

-- ============================================================
-- END core tables baseline
-- ============================================================