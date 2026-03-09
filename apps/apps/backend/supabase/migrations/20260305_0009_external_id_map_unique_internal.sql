-- apps/backend/supabase/migrations/20260305_0009_external_id_map_unique_internal.sql

-- =========================================================
-- Ensure a single mapping per internal object (invoice)
-- Unique(provider, object_type, internal_id)
-- =========================================================

-- 1) (Optionnel mais recommandé) dédoublonnage existant
-- On garde le plus récent par (provider, object_type, internal_id)
delete from public.external_id_map e
using public.external_id_map d
where e.provider = d.provider
  and e.object_type = d.object_type
  and e.internal_id = d.internal_id
  and e.created_at < d.created_at;

-- 2) Ajout contrainte unique (si pas déjà présente)
alter table public.external_id_map
  add constraint external_id_map_unique_internal
  unique (provider, object_type, internal_id);

-- 3) Index (optionnel) pour accélérer lookup par internal_id (si pas déjà créé)
create index if not exists external_id_map_internal_lookup_idx
  on public.external_id_map (provider, object_type, internal_id);