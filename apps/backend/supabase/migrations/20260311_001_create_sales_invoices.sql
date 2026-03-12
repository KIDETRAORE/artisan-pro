-- apps/backend/supabase/migrations/20260311_001_create_sales_invoices.sql

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid null,
  project_id uuid null,
  invoice_number text null,
  status text not null default 'draft',
  issue_date timestamptz null,
  due_date timestamptz null,
  currency text not null default 'EUR',
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  paid_at timestamptz null,
  source_system text null,
  source_external_id text null,
  origin_type text not null default 'manual',
  stripe_checkout_id text null,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_invoices_status_check
    check (status in ('draft', 'sent', 'paid', 'overdue', 'canceled')),
  constraint sales_invoices_origin_type_check
    check (origin_type in ('manual', 'quote', 'compta_import')),
  constraint sales_invoices_subtotal_cents_check
    check (subtotal_cents >= 0),
  constraint sales_invoices_tax_cents_check
    check (tax_cents >= 0),
  constraint sales_invoices_total_cents_check
    check (total_cents >= 0)
);

create index if not exists idx_sales_invoices_user_id
  on public.sales_invoices(user_id);

create index if not exists idx_sales_invoices_contact_id
  on public.sales_invoices(contact_id);

create index if not exists idx_sales_invoices_project_id
  on public.sales_invoices(project_id);

create index if not exists idx_sales_invoices_status
  on public.sales_invoices(status);

create index if not exists idx_sales_invoices_due_date
  on public.sales_invoices(due_date);

create index if not exists idx_sales_invoices_source
  on public.sales_invoices(source_system, source_external_id);

create unique index if not exists idx_sales_invoices_user_invoice_number
  on public.sales_invoices(user_id, invoice_number)
  where invoice_number is not null;

drop trigger if exists trg_sales_invoices_updated_at on public.sales_invoices;

create trigger trg_sales_invoices_updated_at
before update on public.sales_invoices
for each row
execute function public.set_updated_at();