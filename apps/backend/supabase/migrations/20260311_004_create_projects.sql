-- apps/backend/supabase/migrations/20260311_004_create_projects.sql

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client_id uuid null,
  status text not null default 'draft',
  start_date timestamptz null,
  end_date timestamptz null,
  budget_cents bigint null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_status_check
    check (status in ('draft', 'active', 'completed', 'archived', 'canceled')),
  constraint projects_budget_cents_check
    check (budget_cents is null or budget_cents >= 0)
);

create index if not exists idx_projects_user_id
  on public.projects(user_id);

create index if not exists idx_projects_client_id
  on public.projects(client_id);

create index if not exists idx_projects_status
  on public.projects(status);

drop trigger if exists trg_projects_updated_at on public.projects;

create trigger trg_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();