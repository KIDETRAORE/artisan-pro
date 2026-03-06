alter table invoices
add column if not exists stripe_checkout_id text;

alter table invoices
add column if not exists paid_at timestamptz;