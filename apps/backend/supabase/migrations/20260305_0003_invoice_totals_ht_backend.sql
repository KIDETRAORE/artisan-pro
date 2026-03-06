-- supabase/migrations/20260305_0003_invoice_totals_ht_backend.sql

-- =========================================
-- HT-by-default + backend totals computation
-- - Adds tax_included flag (default false => HT)
-- - Adds constraints on invoice_lines
-- - Adds trigger to recompute invoices.subtotal, tax_amount, total_amount
-- =========================================

-- 1) Invoices: store pricing mode (HT by default)
alter table public.invoices
  add column if not exists tax_included boolean not null default false;

-- Ensure numeric columns exist (created in previous migration, but keep safe)
alter table public.invoices
  add column if not exists subtotal numeric;

alter table public.invoices
  add column if not exists tax_amount numeric;

-- total_amount already exists in your current schema; keep it as final TTC total.

-- 2) Constraints on invoice_lines (avoid nonsense data)
alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_qty_positive
    check (quantity > 0);

alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_unit_price_nonneg
    check (unit_price >= 0);

alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_tax_rate_nonneg
    check (tax_rate >= 0);

alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_line_total_nonneg
    check (line_total >= 0);

-- Optional: keep tax_rate under a sane max (e.g., 100)
alter table public.invoice_lines
  add constraint if not exists chk_invoice_lines_tax_rate_max
    check (tax_rate <= 100);

-- 3) Function to recompute totals from lines (HT model)
create or replace function public.recompute_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
begin
  -- subtotal = sum(line_total)
  select coalesce(round(sum(il.line_total), 2), 0)
    into v_subtotal
  from public.invoice_lines il
  where il.invoice_id = p_invoice_id;

  -- tax_amount = sum(line_total * tax_rate/100)
  select coalesce(round(sum(round(il.line_total * (il.tax_rate / 100.0), 2)), 2), 0)
    into v_tax
  from public.invoice_lines il
  where il.invoice_id = p_invoice_id;

  v_total := round(v_subtotal + v_tax, 2);

  update public.invoices
     set subtotal = v_subtotal,
         tax_amount = v_tax,
         total_amount = v_total
   where id = p_invoice_id;
end;
$$;

-- 4) Trigger on invoice_lines to recompute totals
create or replace function public.trg_invoice_lines_recompute_totals()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recompute_invoice_totals(old.invoice_id);
    return old;
  else
    perform public.recompute_invoice_totals(new.invoice_id);
    return new;
  end if;
end;
$$;

drop trigger if exists invoice_lines_recompute_totals on public.invoice_lines;

create trigger invoice_lines_recompute_totals
after insert or update or delete on public.invoice_lines
for each row
execute function public.trg_invoice_lines_recompute_totals();