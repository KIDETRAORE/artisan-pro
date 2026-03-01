create or replace function public.take_next_invoice_to_remind(
  now_ts timestamptz,
  cooldown_days int
)
returns table (
  invoice_id uuid,
  user_id uuid,
  client_name text,
  client_email text,
  due_date timestamptz,
  reminder_count int
)
language plpgsql
security definer
as $$
declare
  v_invoice public.invoices%rowtype;
begin
  -- verrouille 1 facture "unpaid" éligible
  select i.*
  into v_invoice
  from public.invoices i
  where
    i.status = 'unpaid'
    and i.client_email is not null
    and i.due_date <= now_ts
    and (
      i.last_reminder_at is null
      or i.last_reminder_at <= (now_ts - make_interval(days => cooldown_days))
    )
  order by i.due_date asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  return query
  select
    v_invoice.id,
    v_invoice.user_id,
    v_invoice.client_name,
    v_invoice.client_email,
    v_invoice.due_date,
    coalesce(v_invoice.reminder_count, 0);
end;
$$;

revoke all on function public.take_next_invoice_to_remind(timestamptz, int) from public;