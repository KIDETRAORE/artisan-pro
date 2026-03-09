-- supabase/migrations/20260305_0003_amounts_in_cents.sql

-- =========================================================
-- Switch amounts to cents (BIGINT) to avoid rounding issues
-- - Adds *_cents columns
-- - Backfills from existing numeric columns
-- - Recomputes invoice totals in cents via trigger
-- - Keeps numeric columns for backward compatibility
-- =========================================================

-- 0) Safety: ensure tables exist
-- invoices already exists
-- invoice_lines exists from your structural migration

-- 1) Add cents columns (new source of truth)
alter table public.invoice_lines
  add column if not exists unit_price_cents bigint,
  add column if not exists line_total_cents bigint;

alter table public.invoices
  add column if not exists subtotal_cents bigint,
  add column if not exists tax_amount_cents bigint,
  add column if not exists total_amount_cents bigint;

-- Optional but recommended: store tax_included (HT default = false)
alter table public.invoices
  add column if not exists tax_included boolean not null default false;

-- 2) Backfill invoice_lines cents from numeric (if numeric columns exist)
-- unit_price (numeric) -> unit_price_cents
update public.invoice_lines
set unit_price_cents = coalesce(unit_price_cents, round(coalesce(unit_price, 0) * 100)::bigint)
where unit_price_cents is null;

-- line_total (numeric) -> line_total_cents
-- If line_total is null/0 in legacy data, compute from qty*unit_price
update public.invoice_lines
set line_total_cents = coalesce(
  line_total_cents,
  round((coalesce(quantity, 1) * coalesce(unit_price, 0)) * 100)::bigint
)
where line_total_cents is null;

-- 3) Backfill invoices cents from numeric totals if present
update public.invoices
set subtotal_cents = coalesce(subtotal_cents, round(coalesce(subtotal, 0) * 100)::bigint)
where subtotal_cents is null;

update public.invoices
set tax_amount_cents = coalesce(tax_amount_cents, round(coalesce(tax_amount, 0) * 100)::bigint)
where tax_amount_cents is null;

update public.invoices
set total_amount_cents = coalesce(total_amount_cents, round(coalesce(total_amount, 0) * 100)::bigint)
where total_amount_cents is null;

-- 4) Constraints for cents columns
alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_unit_price_cents_nonneg
    check (unit_price_cents is null or unit_price_cents >= 0);

alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_line_total_cents_nonneg
    check (line_total_cents is null or line_total_cents >= 0);

alter table public.invoices
  add constraint if not exists chk_invoices_subtotal_cents_nonneg
    check (subtotal_cents is null or subtotal_cents >= 0);

alter table public.invoices
  add constraint if not exists chk_invoices_tax_amount_cents_nonneg
    check (tax_amount_cents is null or tax_amount_cents >= 0);

alter table public.invoices
  add constraint if not exists chk_invoices_total_amount_cents_nonneg
    check (total_amount_cents is null or total_amount_cents >= 0);

-- 5) Function: recompute totals in cents from invoice_lines (HT-by-default)
-- tax_rate stored as numeric percentage (e.g., 20, 10, 5.5)
create or replace function public.recompute_invoice_totals_cents(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal_cents bigint := 0;
  v_tax_cents bigint := 0;
  v_total_cents bigint := 0;
begin
  -- subtotal_cents = sum(line_total_cents)
  select coalesce(sum(il.line_total_cents), 0)
    into v_subtotal_cents
  from public.invoice_lines il
  where il.invoice_id = p_invoice_id;

  -- tax_cents = sum( round(line_total_cents * tax_rate / 100) )
  -- We compute per-line to avoid accumulating rounding errors.
  select coalesce(sum( round(il.line_total_cents * (il.tax_rate / 100.0))::bigint ), 0)
    into v_tax_cents
  from public.invoice_lines il
  where il.invoice_id = p_invoice_id;

  v_total_cents := v_subtotal_cents + v_tax_cents;

  update public.invoices
     set subtotal_cents = v_subtotal_cents,
         tax_amount_cents = v_tax_cents,
         total_amount_cents = v_total_cents,
         -- Keep legacy numeric columns in sync (optional but convenient)
         subtotal = (v_subtotal_cents / 100.0),
         tax_amount = (v_tax_cents / 100.0),
         total_amount = (v_total_cents / 100.0)
   where id = p_invoice_id;
end;
$$;

-- 6) Trigger: keep cents columns updated on invoice_lines changes
create or replace function public.trg_invoice_lines_set_cents_and_recompute()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    -- Ensure unit_price_cents exists
    if new.unit_price_cents is null then
      new.unit_price_cents := round(coalesce(new.unit_price, 0) * 100)::bigint;
    end if;

    -- Ensure line_total_cents exists
    if new.line_total_cents is null then
      -- Prefer computing from quantity * unit_price_cents to be consistent
      new.line_total_cents := round(coalesce(new.quantity, 1) * (new.unit_price_cents / 1.0))::bigint;
    end if;

    -- Keep legacy numeric columns aligned (optional)
    new.unit_price := (new.unit_price_cents / 100.0);
    new.line_total := (new.line_total_cents / 100.0);

    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists invoice_lines_set_cents on public.invoice_lines;

create trigger invoice_lines_set_cents
before insert or update on public.invoice_lines
for each row
execute function public.trg_invoice_lines_set_cents_and_recompute();

-- Recompute totals AFTER insert/update/delete
create or replace function public.trg_invoice_lines_recompute_totals_cents()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_invoice_totals_cents(old.invoice_id);
    return old;
  else
    perform public.recompute_invoice_totals_cents(new.invoice_id);
    return new;
  end if;
end;
$$;

drop trigger if exists invoice_lines_recompute_totals_cents on public.invoice_lines;

create trigger invoice_lines_recompute_totals_cents
after insert or update or delete on public.invoice_lines
for each row
execute function public.trg_invoice_lines_recompute_totals_cents();

-- 7) Final: recompute all invoices totals in cents once (optional but recommended)
-- (This ensures consistency even if legacy data had odd totals)
do $$
declare
  r record;
begin
  for r in (select id from public.invoices) loop
    perform public.recompute_invoice_totals_cents(r.id);
  end loop;
end $$;