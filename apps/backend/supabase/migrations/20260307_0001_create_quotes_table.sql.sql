-- =========================================
-- QUOTES (DEVIS)
-- =========================================

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  client_name text,

  title text,

  status text not null default 'pending'
    check (status in (
      'draft',
      'pending',
      'sent',
      'open',
      'accepted',
      'rejected',
      'expired',
      'cancelled'
    )),

  total_amount_cents integer not null default 0,

  currency text not null default 'EUR',

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

-- =========================================
-- INDEX
-- =========================================

create index if not exists idx_quotes_user
on public.quotes(user_id);

create index if not exists idx_quotes_status
on public.quotes(status);

create index if not exists idx_quotes_created_at
on public.quotes(created_at desc);

-- =========================================
-- UPDATED_AT TRIGGER
-- =========================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quotes_updated_at on public.quotes;

create trigger trg_quotes_updated_at
before update on public.quotes
for each row
execute function public.set_updated_at();