-- supabase/migrations/20260311_001_create_sales_invoices.sql

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  contact_id uuid null,
  project_id uuid null,

  invoice_number text null,
  status text not null default 'draft',
  currency text not null default 'EUR',

  client_name text not null,
  client_email text null,

  issue_date timestamptz null,
  due_date timestamptz null,
  paid_at timestamptz null,

  subtotal_cents integer null,
  tax_amount_cents integer null,
  total_amount_cents integer null,
  total_amount numeric(12,2) null,

  origin_type text not null default 'manual',
  source_system text null,
  source_external_id text null,

  stripe_checkout_id text null,

  last_reminder_at timestamptz null,
  reminder_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sales_invoices_status_check
    check (status in ('draft', 'sent', 'paid', 'overdue', 'canceled')),

  constraint sales_invoices_origin_type_check
    check (origin_type in ('manual', 'quote', 'compta_import'))
);

create index if not exists sales_invoices_user_id_idx
  on public.sales_invoices(user_id);

create index if not exists sales_invoices_project_id_idx
  on public.sales_invoices(project_id);

create index if not exists sales_invoices_status_idx
  on public.sales_invoices(status);

create index if not exists sales_invoices_due_date_idx
  on public.sales_invoices(due_date);

create index if not exists sales_invoices_source_idx
  on public.sales_invoices(source_system, source_external_id);

create unique index if not exists sales_invoices_user_invoice_number_unique
  on public.sales_invoices(user_id, invoice_number)
  where invoice_number is not null;