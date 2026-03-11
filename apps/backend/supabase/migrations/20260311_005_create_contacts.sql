-- supabase/migrations/20260311_005_create_contacts.sql

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  contact_type text not null default 'client',

  email text null,
  phone text null,

  company_name text null,
  vat_number text null,

  address_line1 text null,
  address_line2 text null,
  postal_code text null,
  city text null,
  country text null,

  source_system text null,
  source_external_id text null,

  notes text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contacts_contact_type_check
    check (contact_type in ('client', 'supplier', 'both'))
);

alter table public.contacts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.contacts
  add column if not exists name text;

alter table public.contacts
  add column if not exists contact_type text;

alter table public.contacts
  add column if not exists email text null;

alter table public.contacts
  add column if not exists phone text null;

alter table public.contacts
  add column if not exists company_name text null;

alter table public.contacts
  add column if not exists vat_number text null;

alter table public.contacts
  add column if not exists address_line1 text null;

alter table public.contacts
  add column if not exists address_line2 text null;

alter table public.contacts
  add column if not exists postal_code text null;

alter table public.contacts
  add column if not exists city text null;

alter table public.contacts
  add column if not exists country text null;

alter table public.contacts
  add column if not exists source_system text null;

alter table public.contacts
  add column if not exists source_external_id text null;

alter table public.contacts
  add column if not exists notes text null;

alter table public.contacts
  add column if not exists created_at timestamptz null;

alter table public.contacts
  add column if not exists updated_at timestamptz null;

alter table public.contacts
  alter column contact_type set default 'client';

alter table public.contacts
  alter column created_at set default now();

alter table public.contacts
  alter column updated_at set default now();

update public.contacts
set contact_type = 'client'
where contact_type is null;

update public.contacts
set created_at = now()
where created_at is null;

update public.contacts
set updated_at = now()
where updated_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_contact_type_check'
  ) then
    alter table public.contacts
      add constraint contacts_contact_type_check
      check (contact_type in ('client', 'supplier', 'both'));
  end if;
end $$;

create index if not exists contacts_user_id_idx
  on public.contacts(user_id);

create index if not exists contacts_contact_type_idx
  on public.contacts(contact_type);

create index if not exists contacts_email_idx
  on public.contacts(email);

create index if not exists contacts_phone_idx
  on public.contacts(phone);

create index if not exists contacts_source_idx
  on public.contacts(source_system, source_external_id);

create unique index if not exists contacts_user_source_external_unique
  on public.contacts(user_id, source_system, source_external_id)
  where source_system is not null and source_external_id is not null;