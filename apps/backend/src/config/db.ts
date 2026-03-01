// apps/backend/src/config/db.ts

/**
 * ⚠️ DEPRECATED – RUNTIME DB ACCESS FORBIDDEN
 *
 * L'application utilise désormais :
 * ✅ supabaseAdmin (PostgREST)
 * ✅ RPC PostgreSQL pour toute logique transactionnelle
 *
 * Le Pool PostgreSQL direct est interdit en runtime.
 *
 * Si vous avez besoin d'un accès SQL direct :
 * - Utiliser des RPC
 * - Ou créer un script dédié dans /scripts (hors runtime)
 */

throw new Error(
  "❌ Direct PostgreSQL Pool access is disabled. Use supabaseAdmin + RPC instead."
);