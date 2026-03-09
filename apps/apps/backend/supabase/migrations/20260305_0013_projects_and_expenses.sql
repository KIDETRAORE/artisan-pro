-- apps/backend/supabase/migrations/20260305_0013_projects_and_expenses.sql

-- =========================================================
-- Projects + Project Expenses
-- Minimal schema for chantier analytics
-- Source of truth = cents
-- =========================================================

-- 1) PROJECTS
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_projects_user_id
  on public.projects (user_id);

create index if not exists idx_projects_user_created_at
  on public.projects (user_id, created_at desc);

create index if not exists idx_projects_status
  on public.projects (status);

-- 2) PROJECT EXPENSES
create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  amount_cents bigint not null,
  vendor text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists idx_project_expenses_user_id
  on public.project_expenses (user_id);

create index if not exists idx_project_expenses_project_id
  on public.project_expenses (project_id);

create index if not exists idx_project_expenses_project_created_at
  on public.project_expenses (project_id, created_at desc);

alter table public.project_expenses
  add constraint chk_project_expenses_amount_cents_nonneg
  check (amount_cents >= 0);

-- 3) INVOICES -> PROJECT LINK
alter table public.invoices
  add column if not exists project_id uuid references public.projects(id);

create index if not exists idx_invoices_project_id
  on public.invoices (project_id);

-- 4) OPTIONAL UPDATED_AT TRIGGER FUNCTION
-- safe reusable helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

drop trigger if exists trg_project_expenses_updated_at on public.project_expenses;
create trigger trg_project_expenses_updated_at
before update on public.project_expenses
for each row
execute function public.set_updated_at();