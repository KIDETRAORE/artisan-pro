-- apps/backend/supabase/migrations/20260311_006_add_contact_refs_to_sales_purchase_payments.sql

alter table public.sales_invoices
  add constraint sales_invoices_contact_fk
  foreign key (contact_id)
  references public.contacts(id)
  on delete set null;

alter table public.purchase_bills
  add constraint purchase_bills_contact_fk
  foreign key (contact_id)
  references public.contacts(id)
  on delete set null;

alter table public.payments
  add constraint payments_contact_fk
  foreign key (contact_id)
  references public.contacts(id)
  on delete set null;

alter table public.projects
  add constraint projects_client_fk
  foreign key (client_id)
  references public.contacts(id)
  on delete set null;

alter table public.sales_invoices
  add constraint sales_invoices_project_fk
  foreign key (project_id)
  references public.projects(id)
  on delete set null;

alter table public.purchase_bills
  add constraint purchase_bills_project_fk
  foreign key (project_id)
  references public.projects(id)
  on delete set null;

drop table if exists public.invoice_lines cascade;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  type text not null,
  description text not null,
  quantity numeric not null,
  unit_price numeric not null default 0,
  tax_rate numeric not null default 0,
  line_total numeric not null default 0,
  created_at timestamptz not null default now(),
  unit_price_cents bigint null,
  line_total_cents bigint null,
  project_id uuid null references public.projects(id) on delete set null,
  updated_at timestamptz not null default now(),
  legacy_invoice_id uuid null,
  constraint invoice_lines_type_check
    check (type in ('sale', 'purchase')),
  constraint invoice_lines_quantity_check
    check (quantity > 0),
  constraint invoice_lines_unit_price_check
    check (unit_price >= 0),
  constraint invoice_lines_tax_rate_check
    check (tax_rate >= 0),
  constraint invoice_lines_line_total_check
    check (line_total >= 0),
  constraint invoice_lines_unit_price_cents_check
    check (unit_price_cents is null or unit_price_cents >= 0),
  constraint invoice_lines_line_total_cents_check
    check (line_total_cents is null or line_total_cents >= 0)
);

create index if not exists idx_invoice_lines_invoice_id
  on public.invoice_lines(invoice_id);

create index if not exists idx_invoice_lines_type
  on public.invoice_lines(type);

create index if not exists idx_invoice_lines_invoice_type
  on public.invoice_lines(invoice_id, type);

create index if not exists idx_invoice_lines_project_id
  on public.invoice_lines(project_id);

create index if not exists idx_invoice_lines_created_at
  on public.invoice_lines(created_at);

drop trigger if exists trg_invoice_lines_updated_at on public.invoice_lines;

create trigger trg_invoice_lines_updated_at
before update on public.invoice_lines
for each row
execute function public.set_updated_at();

create or replace function public.check_invoice_lines_target()
returns trigger
language plpgsql
as $$
declare
  v_exists boolean;
begin
  if new.type = 'sale' then
    select exists(
      select 1
      from public.sales_invoices si
      where si.id = new.invoice_id
    ) into v_exists;
  elsif new.type = 'purchase' then
    select exists(
      select 1
      from public.purchase_bills pb
      where pb.id = new.invoice_id
    ) into v_exists;
  else
    raise exception 'Invalid invoice line type: %', new.type;
  end if;

  if not v_exists then
    raise exception
      'invoice_lines target not found for type=% invoice_id=%',
      new.type, new.invoice_id;
  end if;

  return new;
end;
$$;

create or replace function public.recompute_sales_invoice_totals_cents(
  p_invoice_id uuid
)
returns void
language plpgsql
as $$
declare
  v_subtotal bigint;
  v_tax bigint;
  v_total bigint;
begin
  select
    coalesce(sum(coalesce(il.line_total_cents, round(il.line_total * 100))), 0)::bigint,
    coalesce(
      sum(
        round(
          coalesce(il.line_total_cents, round(il.line_total * 100))
          * (il.tax_rate / 100.0)
        )
      ),
      0
    )::bigint
  into v_subtotal, v_tax
  from public.invoice_lines il
  where il.invoice_id = p_invoice_id
    and il.type = 'sale';

  v_total := v_subtotal + v_tax;

  update public.sales_invoices
  set
    subtotal_cents = v_subtotal,
    tax_cents = v_tax,
    total_cents = v_total,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

create or replace function public.recompute_purchase_bill_totals_cents(
  p_bill_id uuid
)
returns void
language plpgsql
as $$
declare
  v_subtotal bigint;
  v_tax bigint;
  v_total bigint;
begin
  select
    coalesce(sum(coalesce(il.line_total_cents, round(il.line_total * 100))), 0)::bigint,
    coalesce(
      sum(
        round(
          coalesce(il.line_total_cents, round(il.line_total * 100))
          * (il.tax_rate / 100.0)
        )
      ),
      0
    )::bigint
  into v_subtotal, v_tax
  from public.invoice_lines il
  where il.invoice_id = p_bill_id
    and il.type = 'purchase';

  v_total := v_subtotal + v_tax;

  update public.purchase_bills
  set
    subtotal_cents = v_subtotal,
    tax_cents = v_tax,
    total_cents = v_total,
    updated_at = now()
  where id = p_bill_id;
end;
$$;

create or replace function public.sync_invoice_line_amounts()
returns trigger
language plpgsql
as $$
begin
  if new.unit_price_cents is null then
    new.unit_price_cents := round(coalesce(new.unit_price, 0) * 100);
  end if;

  if new.line_total_cents is null then
    new.line_total_cents := round(coalesce(new.line_total, 0) * 100);
  end if;

  if coalesce(new.unit_price, 0) = 0 and new.unit_price_cents is not null then
    new.unit_price := new.unit_price_cents / 100.0;
  end if;

  if coalesce(new.line_total, 0) = 0 and new.line_total_cents is not null then
    new.line_total := new.line_total_cents / 100.0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_lines_sync_amounts on public.invoice_lines;

create trigger trg_invoice_lines_sync_amounts
before insert or update on public.invoice_lines
for each row
execute function public.sync_invoice_line_amounts();