import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

/**
 * ======================
 * VALIDATION ENV
 * ======================
 */
if (!env.SUPABASE_URL) {
  throw new Error("❌ SUPABASE_URL manquant dans les variables d'environnement");
}

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
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
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
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
if (env.NODE_ENV !== "production") {
  console.log("🟢 Supabase Admin client initialisé");
}
