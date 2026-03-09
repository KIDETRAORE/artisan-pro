-- =====================================================================
-- ⚠️ LEGACY SNAPSHOT (NOT SOURCE OF TRUTH)
--
-- This file is kept as a human-readable snapshot / reference only.
-- It is NOT used for provisioning the production schema.
--
-- ✅ Source of truth for schema provisioning:
--    apps/backend/supabase/migrations/*.sql
--
-- Notes:
-- - This file may contain legacy objects (e.g. public.plans) not present in prod.
-- - Stripe columns on subscriptions, quota reset logic, and auth bootstrap logic
--   are defined/maintained via Supabase migrations + RPCs.
--
-- If you need to change the DB schema, do it by adding a new migration under:
--    apps/backend/supabase/migrations/
-- =====================================================================

-- =====================================================
-- ARTISANPRO SAAS V2 - FULL DATABASE SETUP
-- =====================================================

-- ============================
-- 1️⃣ TABLE PROFILES
-- ============================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text default 'user',
  company_name text,
  email text,
  created_at timestamp default now()
);

-- ============================
-- 2️⃣ TABLE SUBSCRIPTIONS
-- ============================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan text default 'free',
  status text default 'active',
  created_at timestamp default now()
);

-- ============================
-- 3️⃣ TABLE AI_QUOTA
-- ============================
create table if not exists public.ai_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit integer not null default 100,
  used integer not null default 0,
  reset_at timestamp not null,
  created_at timestamp default now()
);

-- ============================
-- 4️⃣ TABLE AI_USAGE
-- ============================
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  feature text not null,
  tokens_estimated integer,
  created_at timestamp default now()
);


-- ============================
-- 4️⃣ TABLE public.plans
-- ============================

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  monthly_limit integer not null,
  created_at timestamp default now()
);


-- ============================
-- 5️⃣ FUNCTION: HANDLE NEW USER
-- ============================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.email, 'user');

  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active');

  insert into public.ai_quota (user_id, monthly_limit, used, reset_at)
  values (
    new.id,
    100,
    0,
    now() + interval '30 days'
  );

  return new;
end;
$$;

-- ============================
-- 6️⃣ TRIGGER ON AUTH USER
-- ============================
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ============================
-- 7️⃣ RPC: INCREMENT QUOTA (ATOMIC)
-- ============================
-- DEPRECATED: increment_quota(...) removed.
-- Quota consumption is ONLY via RPC consume_ai_quota(uid, amt) defined in migrations.

-- ============================
-- 8️⃣ ENABLE RLS
-- ============================
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_quota enable row level security;
alter table public.ai_usage enable row level security;

-- ============================
-- 9️⃣ RLS POLICIES
-- ============================

-- Profiles
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

-- Subscriptions
drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
on public.subscriptions
for select
using (auth.uid() = user_id);

-- AI Quota
drop policy if exists "Users can view own quota" on public.ai_quota;
create policy "Users can view own quota"
on public.ai_quota
for select
using (auth.uid() = user_id);

-- AI Usage
drop policy if exists "Users can view own usage" on public.ai_usage;
create policy "Users can view own usage"
on public.ai_usage
for select
using (auth.uid() = user_id);

-- =====================================================
-- END ARTISANPRO SAAS V2 SETUP
-- =====================================================