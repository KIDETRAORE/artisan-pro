-- supabase/migrations/20260311_004_create_projects.sql

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  code text null,
  description text null,

  client_name text null,
  client_email text null,

  status text not null default 'draft',

  start_date timestamptz null,
  end_date timestamptz null,

  budget_cents integer null,
  budget numeric(12,2) null,

  source_system text null,
  source_external_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_status_check
    check (status in ('draft', 'active', 'completed', 'archived', 'canceled'))
);

create index if not exists projects_user_id_idx
  on public.projects(user_id);

create index if not exists projects_status_idx
  on public.projects(status);

create index if not exists projects_source_idx
  on public.projects(source_system, source_external_id);

create unique index if not exists projects_user_code_unique
  on public.projects(user_id, code)
  where code is not null;