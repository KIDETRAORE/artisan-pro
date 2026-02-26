import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";
import { logger } from "../utils/logger";

/**
 * ======================
 * VALIDATION ENV
 * ======================
 */
if (!ENV.SUPABASE_URL) {
  throw new Error("❌ SUPABASE_URL manquant dans les variables d'environnement");
}

if (!ENV.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "❌ SUPABASE_SERVICE_ROLE_KEY manquant (clé ADMIN requise côté backend)"
  );
}

/**
 * ======================
 * CLIENT SUPABASE ADMIN
 * ======================
 * ⚠️ NE JAMAIS exposer cette clé au frontend
 * Utilisé uniquement pour :
 * - quotas IA
 * - usage tracking
 * - storage sécurisé
 * - opérations RPC
 */
export const supabaseAdmin: SupabaseClient = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "artisanpro-backend@1.0.0",
      },
    },
  }
);

/**
 * ======================
 * LOG INIT (DEV)
 * ======================
 */
if (ENV.NODE_ENV !== "production") {
  logger.info("Supabase Admin client initialized");
}