-- apps/backend/supabase/migrations/20260309_add_origin_type_to_invoices.sql

-- ============================================================
-- Migration: Canonical invoice origin fields
-- Goal:
-- Replace legacy source_type with canonical origin_type
-- while preserving external system mapping
-- ============================================================

-- 1️⃣ Add origin_type if missing
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS origin_type TEXT;

-- 2️⃣ Backfill origin_type from source_type
UPDATE invoices
SET origin_type = source_type
WHERE origin_type IS NULL
AND source_type IS NOT NULL;

-- 3️⃣ Ensure source_system exists
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS source_system TEXT;

-- 4️⃣ Ensure source_external_id exists
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS source_external_id TEXT;

-- 5️⃣ Indexes for integrations
CREATE INDEX IF NOT EXISTS idx_invoices_origin_type
ON invoices(origin_type);

CREATE INDEX IF NOT EXISTS idx_invoices_source_system
ON invoices(source_system);

CREATE INDEX IF NOT EXISTS idx_invoices_source_external_id
ON invoices(source_external_id);

-- 6️⃣ Composite index for external sync lookup
CREATE INDEX IF NOT EXISTS idx_invoices_external_mapping
ON invoices(source_system, source_external_id);

-- ============================================================
-- Optional safety normalization
-- ============================================================

UPDATE invoices
SET origin_type = 'manual'
WHERE origin_type IS NULL;

-- ============================================================
-- Final comment
-- origin_type values expected:
-- manual
-- quote
-- compta_import
-- external_sync
-- ============================================================