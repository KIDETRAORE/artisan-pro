-- =========================================
-- Dashboard cache + invoice sequence safety
-- =========================================

-- =============================
-- 1) Invoice sequences (safe numbering)
-- =============================

create table if not exists public.invoice_sequences (
  user_id uuid primary key,
  year int not null,
  last_number int not null default 0,
  updated_at timestamptz default now()
);

create or replace function public.generate_invoice_number(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  y int := extract(year from now());
  next_num int;
begin

  insert into invoice_sequences(user_id, year, last_number)
  values (p_user_id, y, 1)
  on conflict (user_id)
  do update
  set last_number = invoice_sequences.last_number + 1,
      updated_at = now()
  returning last_number into next_num;

  return y || '-' || lpad(next_num::text, 3, '0');

end;
$$;


-- =============================
-- 2) AI logs cleanup
-- =============================

create index if not exists idx_ai_logs_created
on public.ai_logs(created_at);

create or replace function public.cleanup_ai_logs()
returns void
language sql
as $$
delete from ai_logs
where created_at < now() - interval '90 days';
$$;