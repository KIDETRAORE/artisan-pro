-- supabase/migrations/20260305_0002_invoices_structural_mvp.sql

-- =========================================
-- Structural MVP for accounting integrations
-- - Add clients
-- - Add invoice_lines
-- - Lightly extend invoices (without breaking existing fields)
-- =========================================

-- 1) CLIENTS
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_user_id
  on public.clients (user_id);

-- Optional uniqueness: one client per email per user (only if email present)
create unique index if not exists ux_clients_user_email
  on public.clients (user_id, lower(email))
  where email is not null and length(email) > 0;


-- 2) INVOICE_LINES (new)
create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  tax_rate numeric not null default 0,     -- ex: 0, 5.5, 10, 20
  line_total numeric not null default 0,   -- computed by app (qty * unit_price)
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_lines_invoice_id
  on public.invoice_lines (invoice_id);


-- 3) EXTEND INVOICES (light changes, no breaking)
-- Keep existing columns (client_name, total_amount, due_date, status...)
-- Add structured fields for integrations.

alter table public.invoices
  add column if not exists client_id uuid references public.clients(id);

alter table public.invoices
  add column if not exists invoice_number text;

alter table public.invoices
  add column if not exists issue_date timestamptz;

alter table public.invoices
  add column if not exists currency text not null default 'EUR';

alter table public.invoices
  add column if not exists subtotal numeric;

alter table public.invoices
  add column if not exists tax_amount numeric;

alter table public.invoices
  add column if not exists project_id uuid;

-- Helpful indexes
create index if not exists idx_invoices_user_id_created_at
  on public.invoices (user_id, created_at desc);

create index if not exists idx_invoices_client_id
  on public.invoices (client_id);

create index if not exists idx_invoices_project_id
  on public.invoices (project_id);

-- Note:
-- We intentionally do NOT drop old fields like client_name/client_email yet
-- to avoid breaking existing flows (reminders, UI).