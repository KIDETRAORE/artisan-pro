create table if not exists public.accounting_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,

  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,

  payload jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_accounting_events_entity
on public.accounting_events (entity_type, entity_id);

create index if not exists idx_accounting_events_user
on public.accounting_events (user_id, created_at desc);