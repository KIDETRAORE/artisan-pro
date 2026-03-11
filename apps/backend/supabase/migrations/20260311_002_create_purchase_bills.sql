-- supabase/migrations/20260311_002_create_purchase_bills.sql

create table if not exists public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  contact_id uuid null,
  project_id uuid null,

  bill_number text null,
  supplier_reference text null,
  status text not null default 'draft',
  currency text not null default 'EUR',

  supplier_name text not null,
  supplier_email text null,

  issue_date timestamptz null,
  due_date timestamptz null,
  paid_at timestamptz null,

  subtotal_cents integer null,
  tax_amount_cents integer null,
  total_amount_cents integer null,
  total_amount numeric(12,2) null,

  origin_type text not null default 'compta_import',
  source_system text null,
  source_external_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint purchase_bills_status_check
    check (status in ('draft', 'posted', 'paid', 'overdue', 'canceled')),

  constraint purchase_bills_origin_type_check
    check (origin_type in ('manual', 'compta_import'))
);

create index if not exists purchase_bills_user_id_idx
  on public.purchase_bills(user_id);

create index if not exists purchase_bills_project_id_idx
  on public.purchase_bills(project_id);

create index if not exists purchase_bills_status_idx
  on public.purchase_bills(status);

create index if not exists purchase_bills_due_date_idx
  on public.purchase_bills(due_date);

create index if not exists purchase_bills_source_idx
  on public.purchase_bills(source_system, source_external_id);

create unique index if not exists purchase_bills_user_bill_number_unique
  on public.purchase_bills(user_id, bill_number)
  where bill_number is not null;