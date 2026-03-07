alter table public.quotes
add column if not exists invoice_id uuid null;

alter table public.quotes
drop constraint if exists quotes_invoice_id_fkey;

alter table public.quotes
add constraint quotes_invoice_id_fkey
foreign key (invoice_id)
references public.invoices(id)
on delete set null;

create index if not exists idx_quotes_invoice_id
on public.quotes(invoice_id);