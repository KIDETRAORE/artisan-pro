-- ==========================================
-- ARTISANPRO SEED DATA
-- ==========================================

insert into public.plans (name, monthly_limit)
values
('free', 100),
('pro', 1000),
('pro_plus', 5000)
on conflict (name) do nothing;
