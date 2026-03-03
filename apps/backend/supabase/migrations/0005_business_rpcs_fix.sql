-- 0003_business_rpcs.sql
begin;

create or replace function public.get_user_context(uid uuid)
returns table (
  full_name text,
  company_name text,
  plan text,
  status text
)
language sql
security definer
as $$
  select
    p.full_name,
    p.company_name,
    coalesce(s.plan, 'free') as plan,
    coalesce(s.status, 'active') as status
  from public.profiles p
  left join public.subscriptions s on s.user_id = p.id
  where p.id = uid
  limit 1;
$$;

revoke all on function public.get_user_context(uuid) from public;
grant execute on function public.get_user_context(uuid) to authenticated, service_role;

-- Next invoice to remind
create or replace function public.take_next_invoice_to_remind(uid uuid)
returns table (
  id uuid,
  user_id uuid,
  client_name text,
  client_email text,
  total_amount numeric,
  due_date timestamptz,
  reminder_count int,
  last_reminder_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select
    i.id, i.user_id, i.client_name, i.client_email, i.total_amount,
    i.due_date, i.reminder_count, i.last_reminder_at
  from public.invoices i
  where i.user_id = uid
    and i.status = 'sent'
    and i.client_email is not null
    and i.due_date <= now()
    and (i.last_reminder_at is null or i.last_reminder_at <= now() - interval '2 days')
  order by i.due_date asc
  limit 1
  for update skip locked;
end;
$$;

revoke all on function public.take_next_invoice_to_remind(uuid) from public;
grant execute on function public.take_next_invoice_to_remind(uuid) to authenticated, service_role;

-- Mark invoice reminded
create or replace function public.mark_invoice_reminded(invoice_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.invoices
    set last_reminder_at = now(),
        reminder_count = coalesce(reminder_count, 0) + 1
  where id = invoice_id;
end;
$$;

revoke all on function public.mark_invoice_reminded(uuid) from public;
grant execute on function public.mark_invoice_reminded(uuid) to authenticated, service_role;

commit;