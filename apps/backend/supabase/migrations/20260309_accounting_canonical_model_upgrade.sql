-- =========================================================
-- ARTISANPRO - CANONICAL ACCOUNTING MIGRATION
-- Progressive / compatible / non-destructive
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) INVOICES — enrichissement canonique
-- ---------------------------------------------------------

alter table public.invoices
  add column if not exists display_reference text,
  add column if not exists client_phone text,
  add column if not exists client_address jsonb,
  add column if not exists internal_notes text,
  add column if not exists canceled_at timestamptz,
  add column if not exists raw_reference text,
  add column if not exists source_created_at timestamptz,
  add column if not exists source_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Harmonisation douce des colonnes déjà présentes
update public.invoices
set payment_status = coalesce(payment_status, 'unpaid')
where payment_status is null;

update public.invoices
set source_system = coalesce(source_system, 'manual')
where source_system is null;

update public.invoices
set source_priority = coalesce(source_priority, 100)
where source_priority is null;

update public.invoices
set currency = coalesce(currency, 'EUR')
where currency is null;

update public.invoices
set paid_amount_cents = coalesce(paid_amount_cents, 0)
where paid_amount_cents is null;

update public.invoices
set remaining_amount_cents = coalesce(
  remaining_amount_cents,
  greatest(coalesce(total_amount_cents, 0) - coalesce(paid_amount_cents, 0), 0)
)
where remaining_amount_cents is null;

-- Si issue_date est null mais created_at existe, on l'initialise
update public.invoices
set issue_date = created_at
where issue_date is null
  and created_at is not null;

-- Backfill display_reference
update public.invoices
set display_reference = coalesce(invoice_number, display_reference, id::text)
where display_reference is null;

-- Backfill raw_reference depuis invoice_number si possible
update public.invoices
set raw_reference = coalesce(invoice_number, raw_reference)
where raw_reference is null;

-- Contraintes souples sur domaines
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_status_check_v2'
  ) then
    alter table public.invoices
      add constraint invoices_status_check_v2
      check (status in ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'canceled', 'credit_note'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_payment_status_check_v2'
  ) then
    alter table public.invoices
      add constraint invoices_payment_status_check_v2
      check (payment_status in ('unpaid', 'partially_paid', 'paid', 'overpaid', 'refunded'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_amounts_nonnegative_check_v2'
  ) then
    alter table public.invoices
      add constraint invoices_amounts_nonnegative_check_v2
      check (
        coalesce(subtotal_cents, 0) >= 0 and
        coalesce(tax_amount_cents, 0) >= 0 and
        coalesce(total_amount_cents, 0) >= 0 and
        coalesce(paid_amount_cents, 0) >= 0 and
        coalesce(remaining_amount_cents, 0) >= 0
      );
  end if;
end $$;

-- ---------------------------------------------------------
-- 2) PAYMENTS — enrichissement canonique
-- ---------------------------------------------------------

alter table public.payments
  add column if not exists client_id uuid,
  add column if not exists notes text,
  add column if not exists raw_reference text;

update public.payments
set currency = coalesce(currency, 'EUR')
where currency is null;

update public.payments
set status = coalesce(status, 'pending')
where status is null;

update public.payments
set source_system = coalesce(source_system, 'manual')
where source_system is null;

update public.payments
set source_priority = coalesce(source_priority, 100)
where source_priority is null;

update public.payments
set raw_reference = coalesce(payment_reference, bank_reference, raw_reference)
where raw_reference is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_status_check_v1'
  ) then
    alter table public.payments
      add constraint payments_status_check_v1
      check (status in ('pending', 'succeeded', 'failed', 'canceled', 'refunded'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_amount_nonnegative_check_v1'
  ) then
    alter table public.payments
      add constraint payments_amount_nonnegative_check_v1
      check (amount_cents >= 0);
  end if;
end $$;

-- ---------------------------------------------------------
-- 3) EXTERNAL_ID_MAP — sécurisation / extension
-- ---------------------------------------------------------

alter table public.external_id_map
  add column if not exists user_id uuid,
  add column if not exists source_system text,
  add column if not exists external_entity_type text,
  add column if not exists external_parent_id text,
  add column if not exists internal_entity_type text,
  add column if not exists match_confidence text,
  add column if not exists is_active boolean,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists source_payload_hash text,
  add column if not exists notes text;

-- Backfill depuis les anciens noms
update public.external_id_map
set source_system = coalesce(source_system, provider)
where source_system is null;

update public.external_id_map
set external_entity_type = coalesce(external_entity_type, object_type)
where external_entity_type is null;

-- Heuristique prudente pour internal_entity_type
update public.external_id_map
set internal_entity_type = coalesce(internal_entity_type, object_type)
where internal_entity_type is null;

update public.external_id_map
set match_confidence = coalesce(match_confidence, 'exact')
where match_confidence is null;

update public.external_id_map
set is_active = coalesce(is_active, true)
where is_active is null;

update public.external_id_map
set first_seen_at = coalesce(first_seen_at, created_at, now())
where first_seen_at is null;

update public.external_id_map
set last_seen_at = coalesce(last_seen_at, updated_at, created_at, now())
where last_seen_at is null;

-- user_id via invoice/internal object si possible
update public.external_id_map m
set user_id = i.user_id
from public.invoices i
where m.user_id is null
  and m.internal_id = i.id;

update public.external_id_map m
set user_id = p.user_id
from public.payments p
where m.user_id is null
  and m.internal_id = p.id;

update public.external_id_map m
set user_id = q.user_id
from public.quotes q
where m.user_id is null
  and m.internal_id = q.id;

update public.external_id_map m
set user_id = c.user_id
from public.clients c
where m.user_id is null
  and m.internal_id = c.id;

update public.external_id_map m
set user_id = pr.user_id
from public.projects pr
where m.user_id is null
  and m.internal_id = pr.id;

-- user_id reste nullable si on ne peut pas le déduire sans risque

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_id_map_match_confidence_check_v1'
  ) then
    alter table public.external_id_map
      add constraint external_id_map_match_confidence_check_v1
      check (match_confidence in ('exact', 'high', 'probable', 'manual'));
  end if;
end $$;

-- ---------------------------------------------------------
-- 4) INDEX UTILES
-- ---------------------------------------------------------

create index if not exists invoices_user_id_idx
  on public.invoices(user_id);

create index if not exists invoices_project_id_idx
  on public.invoices(project_id);

create index if not exists invoices_client_id_idx
  on public.invoices(client_id);

create index if not exists invoices_status_idx
  on public.invoices(status);

create index if not exists invoices_payment_status_idx
  on public.invoices(payment_status);

create index if not exists invoices_due_date_idx
  on public.invoices(due_date);

create index if not exists invoices_issue_date_idx
  on public.invoices(issue_date);

create index if not exists invoices_invoice_number_idx
  on public.invoices(invoice_number);

create index if not exists invoices_display_reference_idx
  on public.invoices(display_reference);

create index if not exists invoices_source_system_external_id_idx
  on public.invoices(source_system, source_external_id);

create index if not exists invoices_source_priority_idx
  on public.invoices(source_priority);

create index if not exists payments_user_id_idx
  on public.payments(user_id);

create index if not exists payments_invoice_id_idx
  on public.payments(invoice_id);

create index if not exists payments_status_idx
  on public.payments(status);

create index if not exists payments_payment_date_idx
  on public.payments(payment_date);

create index if not exists payments_received_at_idx
  on public.payments(received_at);

create index if not exists payments_source_system_external_id_idx
  on public.payments(source_system, source_external_id);

create index if not exists payments_provider_idx
  on public.payments(provider);

create index if not exists external_id_map_internal_lookup_idx
  on public.external_id_map(internal_entity_type, internal_id);

create index if not exists external_id_map_source_lookup_idx
  on public.external_id_map(source_system, external_entity_type);

create index if not exists external_id_map_user_id_idx
  on public.external_id_map(user_id);

create index if not exists external_id_map_is_active_idx
  on public.external_id_map(is_active);

-- Unicité logique externe
create unique index if not exists external_id_map_unique_external_idx
  on public.external_id_map(source_system, external_entity_type, external_id);

-- ---------------------------------------------------------
-- 5) OPTIONAL SAFE UNIQUENESS FOR INVOICES
-- ---------------------------------------------------------
-- Unicité partielle: une même source externe ne doit pas mapper vers
-- plusieurs invoices si source_external_id est renseigné.

create unique index if not exists invoices_unique_source_external_idx
  on public.invoices(source_system, source_external_id)
  where source_external_id is not null;

create unique index if not exists payments_unique_source_external_idx
  on public.payments(source_system, source_external_id)
  where source_external_id is not null;

-- ---------------------------------------------------------
-- 6) UPDATED_AT TRIGGERS
-- ---------------------------------------------------------

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invoices_set_updated_at on public.invoices;
create trigger trg_invoices_set_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_payments_set_updated_at on public.payments;
create trigger trg_payments_set_updated_at
before update on public.payments
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_external_id_map_set_updated_at on public.external_id_map;
create trigger trg_external_id_map_set_updated_at
before update on public.external_id_map
for each row
execute function public.set_updated_at_timestamp();

-- ---------------------------------------------------------
-- 7) RECALCUL CANONIQUE DES PAIEMENTS FACTURE
-- ---------------------------------------------------------

create or replace function public.recompute_invoice_payment_totals(
  p_invoice_id uuid
)
returns void
language plpgsql
as $$
declare
  v_total bigint;
  v_paid bigint;
  v_remaining bigint;
  v_payment_status text;
  v_invoice_status text;
begin
  select coalesce(total_amount_cents, 0), coalesce(status, 'draft')
    into v_total, v_invoice_status
  from public.invoices
  where id = p_invoice_id;

  if not found then
    return;
  end if;

  select coalesce(sum(amount_cents), 0)
    into v_paid
  from public.payments
  where invoice_id = p_invoice_id
    and status = 'succeeded';

  v_remaining := greatest(v_total - v_paid, 0);

  if v_paid = 0 then
    v_payment_status := 'unpaid';
  elsif v_paid < v_total then
    v_payment_status := 'partially_paid';
  elsif v_paid = v_total then
    v_payment_status := 'paid';
  else
    v_payment_status := 'overpaid';
  end if;

  update public.invoices
  set
    paid_amount_cents = v_paid,
    remaining_amount_cents = v_remaining,
    payment_status = v_payment_status,
    paid_at = case
      when v_payment_status in ('paid', 'overpaid') then coalesce(paid_at, now())
      else paid_at
    end,
    status = case
      when v_invoice_status = 'canceled' then v_invoice_status
      when v_payment_status in ('paid', 'overpaid') then 'paid'
      when v_invoice_status = 'paid' and v_payment_status not in ('paid', 'overpaid') then 'sent'
      else v_invoice_status
    end
  where id = p_invoice_id;
end;
$$;

create or replace function public.trg_recompute_invoice_payment_totals()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_invoice_payment_totals(old.invoice_id);
    return old;
  else
    perform public.recompute_invoice_payment_totals(new.invoice_id);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_payments_recompute_invoice on public.payments;
create trigger trg_payments_recompute_invoice
after insert or update or delete on public.payments
for each row
execute function public.trg_recompute_invoice_payment_totals();

-- ---------------------------------------------------------
-- 8) ACCOUNTING_EVENTS SUPPORT INDEXES
-- ---------------------------------------------------------

create index if not exists accounting_events_user_id_idx
  on public.accounting_events(user_id);

create index if not exists accounting_events_entity_lookup_idx
  on public.accounting_events(entity_type, entity_id);

create index if not exists accounting_events_event_type_idx
  on public.accounting_events(event_type);

commit;