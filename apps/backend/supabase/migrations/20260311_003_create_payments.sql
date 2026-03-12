-- apps/backend/supabase/migrations/20260311_003_create_payments.sql

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid null,
  amount_cents bigint not null,
  currency text not null default 'EUR',
  payment_date timestamptz null,
  method text null,
  reference text null,
  payment_type text not null,
  status text not null default 'posted',
  source_system text null,
  source_external_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount_cents_check
    check (amount_cents >= 0),
  constraint payments_payment_type_check
    check (payment_type in ('inbound', 'outbound')),
  constraint payments_status_check
    check (status in ('draft', 'posted', 'reconciled', 'canceled'))
);

create table if not exists public.payment_allocations (
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_id uuid not null,
  invoice_type text not null,
  amount_cents bigint not null,
  created_at timestamptz not null default now(),
  primary key (payment_id, invoice_id, invoice_type),
  constraint payment_allocations_invoice_type_check
    check (invoice_type in ('sale', 'purchase')),
  constraint payment_allocations_amount_cents_check
    check (amount_cents > 0)
);

create index if not exists idx_payments_user_id
  on public.payments(user_id);

create index if not exists idx_payments_contact_id
  on public.payments(contact_id);

create index if not exists idx_payments_payment_date
  on public.payments(payment_date);

create index if not exists idx_payments_payment_type
  on public.payments(payment_type);

create index if not exists idx_payments_status
  on public.payments(status);

create index if not exists idx_payments_source
  on public.payments(source_system, source_external_id);

create index if not exists idx_payment_allocations_invoice
  on public.payment_allocations(invoice_id, invoice_type);

drop trigger if exists trg_payments_updated_at on public.payments;

create trigger trg_payments_updated_at
before update on public.payments
for each row
execute function public.set_updated_at();

create or replace function public.check_payment_allocation_target()
returns trigger
language plpgsql
as $$
declare
  v_exists boolean;
begin
  if new.invoice_type = 'sale' then
    select exists(
      select 1
      from public.sales_invoices si
      where si.id = new.invoice_id
    ) into v_exists;
  elsif new.invoice_type = 'purchase' then
    select exists(
      select 1
      from public.purchase_bills pb
      where pb.id = new.invoice_id
    ) into v_exists;
  else
    raise exception 'Invalid invoice_type: %', new.invoice_type;
  end if;

  if not v_exists then
    raise exception
      'payment_allocations target not found for invoice_type=% invoice_id=%',
      new.invoice_type, new.invoice_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payment_allocations_target_check on public.payment_allocations;

create trigger trg_payment_allocations_target_check
before insert or update on public.payment_allocations
for each row
execute function public.check_payment_allocation_target();