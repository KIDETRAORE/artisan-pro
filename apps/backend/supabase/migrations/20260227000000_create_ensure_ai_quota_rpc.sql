-- Sécurité : on retire l'accès public
revoke all on function public.ensure_ai_quota(uuid) from public;
revoke all on function public.set_ai_quota_limit(uuid, int) from public;

-- On autorise UNIQUEMENT le service_role (backend)
grant execute on function public.ensure_ai_quota(uuid) to service_role;
grant execute on function public.set_ai_quota_limit(uuid, int) to service_role;