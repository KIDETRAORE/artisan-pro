-- 0004_indexes_views_guardrails.sql

begin;

-- Indexes utiles
create index if not exists idx_ai_logs_user_id on public.ai_logs(user_id);
create index if not exists idx_ai_usage_user_id on public.ai_usage(user_id);
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_invoices_due_date on public.invoices(due_date);
create index if not exists idx_vision_analyses_user_id on public.vision_analyses(user_id);
create index if not exists idx_vision_analyses_project_id on public.vision_analyses(project_id);

-- Uniques Stripe ids (évite doublons)
create unique index if not exists subscriptions_stripe_customer_id_uniq
  on public.subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists subscriptions_stripe_subscription_id_uniq
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

-- user_usage: 1 ligne par user & mois
create unique index if not exists user_usage_user_month_uniq
  on public.user_usage(user_id, month_date);

-- View (optionnelle)
create or replace view public.user_usage_view as
select user_id, month_date, analyses_count
from public.user_usage;

-- Guardrail: interdire de diminuer analyses_count
create or replace function public.prevent_decrease_user_usage()
returns trigger
language plpgsql
as $$
begin
  if new.analyses_count < old.analyses_count then
    raise exception 'analyses_count cannot decrease';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_decrease_user_usage on public.user_usage;

create trigger trg_prevent_decrease_user_usage
before update on public.user_usage
for each row
execute function public.prevent_decrease_user_usage();

commit;