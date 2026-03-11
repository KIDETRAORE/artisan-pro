-- supabase/migrations/20260311_003_create_payments.sql

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  contact_id uuid null,
  project_id uuid null,

  payment_type text not null,
  status text not null default 'posted',
  currency text not null default 'EUR',

  amount_cents integer not null,
  amount numeric(12,2) null,

  payment_date timestamptz null,
  reference text null,
  method text null,
  note text null,

  source_system text null,
  source_external_id text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_payment_type_check
    check (payment_type in ('inbound', 'outbound')),

  constraint payments_status_check
    check (status in ('draft', 'posted', 'reconciled', 'canceled'))
);

alter table public.payments
  add column if not exists contact_id uuid null;

alter table public.payments
  add column if not exists project_id uuid null;

alter table public.payments
  add column if not exists payment_type text;

alter table public.payments
  add column if not exists status text;

alter table public.payments
  add column if not exists currency text;

alter table public.payments
  add column if not exists amount_cents integer;

alter table public.payments
  add column if not exists amount numeric(12,2) null;

alter table public.payments
  add column if not exists payment_date timestamptz null;

alter table public.payments
  add column if not exists reference text null;

alter table public.payments
  add column if not exists method text null;

alter table public.payments
  add column if not exists note text null;

alter table public.payments
  add column if not exists source_system text null;

alter table public.payments
  add column if not exists source_external_id text null;

alter table public.payments
  add column if not exists created_at timestamptz null;

alter table public.payments
  add column if not exists updated_at timestamptz null;

alter table public.payments
  alter column status set default 'posted';

alter table public.payments
  alter column currency set default 'EUR';

alter table public.payments
  alter column created_at set default now();

alter table public.payments
  alter column updated_at set default now();

update public.payments
set status = 'posted'
where status is null;

update public.payments
set currency = 'EUR'
where currency is null;

update public.payments
set created_at = now()
where created_at is null;

update public.payments
set updated_at = now()
where updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_payment_type_check'
  ) then
    alter table public.payments
      add constraint payments_payment_type_check
      check (payment_type in ('inbound', 'outbound'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_status_check'
  ) then
    alter table public.payments
      add constraint payments_status_check
      check (status in ('draft', 'posted', 'reconciled', 'canceled'));
  end if;
end $$;

create index if not exists payments_user_id_idx
  on public.payments(user_id);

create index if not exists payments_project_id_idx
  on public.payments(project_id);

create index if not exists payments_contact_id_idx
  on public.payments(contact_id);

create index if not exists payments_payment_type_idx
  on public.payments(payment_type);

create index if not exists payments_payment_date_idx
  on public.payments(payment_date);

create index if not exists payments_source_idx
  on public.payments(source_system, source_external_id);