-- apps/backend/supabase/migrations/20260302120400_user_usage_guardrails.sql

-- 1) Unique par mois et par user (évite doublons)
create unique index if not exists uq_user_usage_user_month
on public.user_usage (user_id, month_date);

-- 2) View canonique (recréée au cas où)
create or replace view public.user_usage_view as
select
  uu.user_id,
  uu.month_date,
  uu.analyses_count
from public.user_usage uu;