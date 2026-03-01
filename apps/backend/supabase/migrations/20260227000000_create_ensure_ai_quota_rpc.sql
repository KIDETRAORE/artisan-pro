-- RPC: ensure_ai_quota
-- But: garantir qu'une ligne ai_quota existe pour l'utilisateur, sans toucher à used
--      reset_at est aligné sur le début du mois suivant (comme ton default)

create or replace function public.ensure_ai_quota(uid uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Crée la ligne si absente (monthly_limit/reset_at default)
  insert into public.ai_quota (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  -- Optionnel: si reset_at est dans le passé (ex: table existante, valeurs incohérentes),
  -- on le réaligne sans modifier used.
  update public.ai_quota
  set reset_at = (date_trunc('month', now()) + interval '1 month')
  where user_id = uid
    and reset_at < now();
end;
$$;

-- Permissions (si tu veux l'appeler via service role uniquement, tu peux ne pas exposer)
-- mais en général avec supabase service role, ça passe.
revoke all on function public.ensure_ai_quota(uuid) from public;

--------------------------------------------------------------------------------
-- Optionnel (mais propre) : RPC admin pour changer le monthly_limit
--------------------------------------------------------------------------------

create or replace function public.set_ai_quota_limit(uid uuid, new_limit int)
returns void
language plpgsql
security definer
as $$
begin
  if new_limit < 0 then
    raise exception 'new_limit must be >= 0';
  end if;

  -- garantit la ligne
  perform public.ensure_ai_quota(uid);

  update public.ai_quota
  set monthly_limit = new_limit
  where user_id = uid;
end;
$$;

revoke all on function public.set_ai_quota_limit(uuid, int) from public;