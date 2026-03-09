-- supabase/migrations/20260305_0001_integrations_mvp.sql

-- =========================================
-- Integrations MVP (Pennylane first)
-- =========================================

-- 1) Integrations (per user + provider)
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- 2) Tokens (OAuth ready)
-- MVP: can stay empty if using provider API key in ENV.
create table if not exists public.integration_tokens (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Sync state (cursor for delta sync)
create table if not exists public.integration_sync_state (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  cursor text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  error_count int not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

-- 4) External ID map (idempotency + avoids duplicates)
create table if not exists public.external_id_map (
  provider text not null,
  object_type text not null,
  external_id text not null,
  internal_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, object_type, external_id)
);

create index if not exists idx_external_id_map_internal
  on public.external_id_map (internal_id);

-- 5) Sync events (observability)
create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  provider text not null,
  object_type text,
  object_id text,
  status text not null,
  message text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sync_events_user_created
  on public.sync_events (user_id, created_at desc);

create index if not exists idx_sync_events_provider_created
  on public.sync_events (provider, created_at desc);

-- 6) Updated_at triggers (optional light)
-- If you already have a shared trigger function, reuse it.
-- Otherwise, simplest: ignore updated_at auto-update for MVP.