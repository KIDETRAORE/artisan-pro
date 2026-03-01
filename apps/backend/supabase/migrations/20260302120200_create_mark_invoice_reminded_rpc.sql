create or replace function public.mark_invoice_reminded(
  invoice_id uuid,
  now_ts timestamptz
)
returns void
language sql
security definer
as $$
  update public.invoices
  set
    last_reminder_at = now_ts,
    reminder_count = coalesce(reminder_count, 0) + 1
  where id = invoice_id;
$$;

revoke all on function public.mark_invoice_reminded(uuid, timestamptz) from public;