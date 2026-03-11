-- supabase/migrations/20260311_006_add_contact_refs_to_sales_purchase_payments.sql

alter table public.sales_invoices
add column if not exists contact_id uuid;

alter table public.purchase_bills
add column if not exists contact_id uuid;

alter table public.payments
add column if not exists contact_id uuid;

create index if not exists sales_invoices_contact_id_idx
on public.sales_invoices(contact_id);

create index if not exists purchase_bills_contact_id_idx
on public.purchase_bills(contact_id);

create index if not exists payments_contact_id_idx
on public.payments(contact_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_invoices_contact_fk'
  ) then
    alter table public.sales_invoices
      add constraint sales_invoices_contact_fk
      foreign key (contact_id)
      references public.contacts(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'purchase_bills_contact_fk'
  ) then
    alter table public.purchase_bills
      add constraint purchase_bills_contact_fk
      foreign key (contact_id)
      references public.contacts(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_contact_fk'
  ) then
    alter table public.payments
      add constraint payments_contact_fk
      foreign key (contact_id)
      references public.contacts(id)
      on delete set null;
  end if;
end $$;