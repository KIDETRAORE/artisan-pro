with u as (
  select gen_random_uuid() as uid
)
select
  u.uid,
  c.*
from u
cross join lateral public.consume_ai_quota(u.uid, 1) as c;