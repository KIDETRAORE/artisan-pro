-- apps/backend/supabase/migrations/20260311_002_create_purchase_bills.sql

create table if not exists public.purchase_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid null,
  project_id uuid null,
  bill_number text null,
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
  origin_type text not null default 'compta_import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_bills_status_check
    check (status in ('draft', 'posted', 'paid', 'overdue', 'canceled')),
  constraint purchase_bills_origin_type_check
    check (origin_type in ('manual', 'compta_import')),
  constraint purchase_bills_subtotal_cents_check
    check (subtotal_cents >= 0),
  constraint purchase_bills_tax_cents_check
    check (tax_cents >= 0),
  constraint purchase_bills_total_cents_check
    check (total_cents >= 0)
);

create index if not exists idx_purchase_bills_user_id
  on public.purchase_bills(user_id);

create index if not exists idx_purchase_bills_contact_id
  on public.purchase_bills(contact_id);

create index if not exists idx_purchase_bills_project_id
  on public.purchase_bills(project_id);

create index if not exists idx_purchase_bills_status
  on public.purchase_bills(status);

create index if not exists idx_purchase_bills_due_date
  on public.purchase_bills(due_date);

create index if not exists idx_purchase_bills_source
  on public.purchase_bills(source_system, source_external_id);

create unique index if not exists idx_purchase_bills_user_bill_number
  on public.purchase_bills(user_id, bill_number)
  where bill_number is not null;

drop trigger if exists trg_purchase_bills_updated_at on public.purchase_bills;

create trigger trg_purchase_bills_updated_at
before update on public.purchase_bills
for each row
execute function public.set_updated_at();