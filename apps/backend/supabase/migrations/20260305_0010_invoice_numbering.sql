-- =========================================
-- Invoice numbering (legal FR)
-- Format: YYYY-XXX
-- Unique per user
-- =========================================

alter table public.invoices
add column if not exists invoice_number text;

create unique index if not exists ux_invoices_user_invoice_number
on public.invoices (user_id, invoice_number)
where invoice_number is not null;


create or replace function public.generate_invoice_number(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  current_year text;
  next_seq int;
  result text;
begin
  current_year := to_char(now(), 'YYYY');

  select coalesce(
    max(
      substring(invoice_number from '[0-9]+$')::int
    ), 0
  ) + 1
  into next_seq
  from public.invoices
  where user_id = p_user_id
  and invoice_number like current_year || '-%';

  result := current_year || '-' || lpad(next_seq::text, 3, '0');

  return result;
end;
$$;