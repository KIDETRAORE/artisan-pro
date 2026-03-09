-- apps/backend/supabase/migrations/20260305_0010_projects_analytics.sql

-- =========================================================
-- Projects (chantiers) + Expenses + Analytics RPC
-- - Source of truth: cents
-- - Analytics: revenue/expenses/profit + profitability_rate
-- =========================================================

-- 1) Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  client_name text,
  address text,
  status text not null default 'active',
  budget_cents bigint,
  created_at timestamptz not null default now()
);

alter table public.projects
  add column if not exists client_name text,
  add column if not exists address text,
  add column if not exists status text not null default 'active',
  add column if not exists budget_cents bigint;

create index if not exists idx_projects_user_created
  on public.projects (user_id, created_at desc);

-- 2) Project expenses
create table if not exists public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  description text,
  amount_cents bigint not null,
  category text,
  expense_date date,
  created_at timestamptz not null default now()
);

alter table public.project_expenses
  add column if not exists description text,
  add column if not exists category text,
  add column if not exists expense_date date;
  
create index if not exists idx_project_expenses_project
  on public.project_expenses (project_id, created_at desc);

create index if not exists idx_project_expenses_user
  on public.project_expenses (user_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_project_expenses_amount_nonneg'
  ) then
    alter table public.project_expenses
      add constraint chk_project_expenses_amount_nonneg
      check (amount_cents >= 0);
  end if;
end $$;

-- 3) Ensure invoices.project_id exists (you already added it earlier, keep safe)
alter table public.invoices
  add column if not exists project_id uuid;

create index if not exists idx_invoices_project_id
  on public.invoices (project_id);

-- 4) RPC: get_project_analytics
-- revenue = sum(paid invoices total_amount_cents) OR (sent+paid) depending on your definition.
-- Here we use: all non-canceled invoices as "revenue issued", and also expose "paid" separately.
create or replace function public.get_project_analytics(
  p_user_id uuid,
  p_project_id uuid
)
returns table (
  revenue_cents bigint,
  paid_cents bigint,
  expenses_cents bigint,
  profit_cents bigint,
  profitability_rate numeric
)
language plpgsql
as $$
declare
  v_revenue bigint := 0;
  v_paid bigint := 0;
  v_expenses bigint := 0;
begin
  -- Revenue issued (sent/paid/overdue/draft except canceled)
  select coalesce(sum(coalesce(i.total_amount_cents, 0)), 0)
    into v_revenue
  from public.invoices i
  where i.user_id = p_user_id
    and i.project_id = p_project_id
    and lower(coalesce(i.status, '')) <> 'canceled';

  -- Paid only
  select coalesce(sum(coalesce(i.total_amount_cents, 0)), 0)
    into v_paid
  from public.invoices i
  where i.user_id = p_user_id
    and i.project_id = p_project_id
    and lower(coalesce(i.status, '')) = 'paid';

  -- Expenses
  select coalesce(sum(e.amount_cents), 0)
    into v_expenses
  from public.project_expenses e
  where e.user_id = p_user_id
    and e.project_id = p_project_id;

  revenue_cents := v_revenue;
  paid_cents := v_paid;
  expenses_cents := v_expenses;
  profit_cents := v_revenue - v_expenses;

  if v_revenue > 0 then
    profitability_rate := round(((v_revenue - v_expenses)::numeric / v_revenue::numeric) * 100, 2);
  else
    profitability_rate := 0;
  end if;

  return next;
end;
$$;