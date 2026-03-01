-- Normalize invoices.status values + add CHECK constraint
-- Allowed: sent | unpaid | paid | canceled

BEGIN;

-- 1) Normalize existing values (handles old uppercase / variants)
UPDATE public.invoices
SET status = LOWER(status)
WHERE status IS NOT NULL;

-- Optional: map common legacy synonyms to the canonical set
UPDATE public.invoices
SET status = 'unpaid'
WHERE status IN ('unpaid', 'unpaid ', 'unpaid\t');

UPDATE public.invoices
SET status = 'paid'
WHERE status IN ('payed'); -- if it ever happened

-- If you had 'overdue' in the past, you can decide a mapping:
-- UPDATE public.invoices SET status = 'unpaid' WHERE status = 'overdue';

-- 2) Ensure default is 'sent' (already ok in your DB, but kept explicit)
ALTER TABLE public.invoices
ALTER COLUMN status SET DEFAULT 'sent';

-- 3) Add constraint (drop then add for idempotence)
ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
ADD CONSTRAINT invoices_status_check
CHECK (status IN ('sent', 'unpaid', 'paid', 'canceled'));

COMMIT;