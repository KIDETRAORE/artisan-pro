begin;

-- =========================
-- vision_analyses
-- =========================
create index if not exists idx_vision_analyses_user_created_at
  on public.vision_analyses (user_id, created_at desc);

create index if not exists idx_vision_analyses_project_created_at
  on public.vision_analyses (project_id, created_at desc);

-- =========================
-- ai_logs
-- =========================
create index if not exists idx_ai_logs_user_created_at
  on public.ai_logs (user_id, created_at desc);

-- =========================
-- subscriptions
-- =========================
create index if not exists idx_subscriptions_user_id
  on public.subscriptions (user_id);

-- =========================
-- ai_usage (si table utilisée)
-- =========================
create index if not exists idx_ai_usage_user_created_at
  on public.ai_usage (user_id, created_at desc);

commit;