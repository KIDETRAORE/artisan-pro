-- apps/backend/supabase/migrations/20260311_005_create_contacts.sql

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_type text not null default 'client',
  email text null,
  phone text null,
  address text null,
  city text null,
  postal_code text null,
  country text null,
  vat_number text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_contact_type_check
    check (contact_type in ('client', 'supplier', 'both'))
);

create index if not exists idx_contacts_user_id
  on public.contacts(user_id);

create index if not exists idx_contacts_contact_type
  on public.contacts(contact_type);

create index if not exists idx_contacts_email
  on public.contacts(email);

drop trigger if exists trg_contacts_updated_at on public.contacts;

create trigger trg_contacts_updated_at
before update on public.contacts
for each row
execute function public.set_updated_at();