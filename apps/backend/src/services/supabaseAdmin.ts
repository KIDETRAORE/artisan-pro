import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.ts';

/**
 * CLIENT SUPABASE ADMIN
 * Utilisé uniquement par le backend pour modifier les quotas et l'usage.
 */
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);