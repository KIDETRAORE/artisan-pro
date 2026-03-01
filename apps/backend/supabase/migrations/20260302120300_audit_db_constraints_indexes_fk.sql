-- apps/backend/supabase/migrations/20260302120000_audit_db_constraints_indexes_fk.sql

-- ============================================================
-- 1) ai_quota(user_id) : PK/unique (si pas déjà)
-- ============================================================
DO $$
BEGIN
  -- Skip if table doesn't exist
  IF to_regclass('public.ai_quota') IS NULL THEN
    RAISE NOTICE 'Skip: public.ai_quota does not exist';
    RETURN;
  END IF;

  -- Ensure ai_quota.user_id is unique/PK
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_quota_pkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.ai_quota
      ADD CONSTRAINT ai_quota_pkey PRIMARY KEY (user_id);
  END IF;
END $$;

-- ============================================================
-- 2) Indexes recommandés (créés seulement si la table existe)
-- ============================================================

-- invoices(user_id, status, due_date) : critique pour automation
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE NOTICE 'Skip index: public.invoices does not exist';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_user_status_due_date ON public.invoices (user_id, status, due_date)';
  END IF;
END $$;

-- vision_analyses(user_id, created_at) : history perf
DO $$
BEGIN
  IF to_regclass('public.vision_analyses') IS NULL THEN
    RAISE NOTICE 'Skip index: public.vision_analyses does not exist';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vision_analyses_user_created_at ON public.vision_analyses (user_id, created_at)';
  END IF;
END $$;

-- subscriptions(user_id) : lecture fréquente (plan/status)
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RAISE NOTICE 'Skip index: public.subscriptions does not exist';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id)';
  END IF;
END $$;

-- (optionnel utile) projects(user_id, created_at)
DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'Skip index: public.projects does not exist';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_user_created_at ON public.projects (user_id, created_at)';
  END IF;
END $$;

-- ============================================================
-- 3) Uniques Stripe IDs (si applicable) — only if columns exist
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RAISE NOTICE 'Skip unique stripe indexes: public.subscriptions does not exist';
    RETURN;
  END IF;

  -- Unique stripe_customer_id (ignore nulls)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscriptions' AND column_name='stripe_customer_id'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_customer_id ON public.subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL';
  ELSE
    RAISE NOTICE 'Skip unique index: subscriptions.stripe_customer_id column does not exist';
  END IF;

  -- Unique stripe_subscription_id (ignore nulls)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscriptions' AND column_name='stripe_subscription_id'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_subscription_id ON public.subscriptions (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL';
  ELSE
    RAISE NOTICE 'Skip unique index: subscriptions.stripe_subscription_id column does not exist';
  END IF;
END $$;

-- ============================================================
-- 4) Contraintes CHECK recommandées (ajoutées seulement si table existe)
-- ============================================================

-- profiles.role CHECK (user|admin)
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skip check: public.profiles does not exist';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

-- subscriptions.plan CHECK (free|pro)
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RAISE NOTICE 'Skip check: public.subscriptions does not exist';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_plan_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_plan_check
      CHECK (plan IN ('free', 'pro'));
  END IF;
END $$;

-- subscriptions.status CHECK (liste “raisonnable” Stripe)
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL THEN
    RAISE NOTICE 'Skip check: public.subscriptions does not exist';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_status_check'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_status_check
      CHECK (
        status IN ('active', 'trialing', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')
      );
  END IF;
END $$;

-- (Note) invoices.status CHECK : déjà partiellement fait chez toi via migration normalize_invoices_status.sql
-- On ne le recrée pas ici.

-- ============================================================
-- 5) Foreign Keys (FK) — ajoutées seulement si les tables existent
-- ============================================================

-- projects.user_id -> profiles.id
DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skip FK: projects -> profiles (missing table)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_user_id_fkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- invoices.user_id -> profiles.id
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skip FK: invoices -> profiles (missing table)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_user_id_fkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- subscriptions.user_id -> profiles.id
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skip FK: subscriptions -> profiles (missing table)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_fkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- vision_analyses.user_id -> profiles.id
DO $$
BEGIN
  IF to_regclass('public.vision_analyses') IS NULL OR to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skip FK: vision_analyses -> profiles (missing table)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vision_analyses_user_id_fkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.vision_analyses
      ADD CONSTRAINT vision_analyses_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- vision_analyses.project_id -> projects.id
-- project_id est nullable : OK
DO $$
BEGIN
  IF to_regclass('public.vision_analyses') IS NULL OR to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'Skip FK: vision_analyses.project_id -> projects (missing table)';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vision_analyses_project_id_fkey'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.vision_analyses
      ADD CONSTRAINT vision_analyses_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id)
      ON DELETE SET NULL;
  END IF;
END $$;