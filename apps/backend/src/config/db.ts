import { Pool } from "pg";
import { ENV } from "./env";
import { logger } from "../utils/logger";

/**
 * Configuration du Pool PostgreSQL
 * Le Pool permet de réutiliser les connexions pour de meilleures performances.
 */
const pool = new Pool({
  connectionString: ENV.DATABASE_URL,
  // Sécurité : évite les fuites de connexion
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Test de connexion immédiat au démarrage
 */
pool.connect((err, client, release) => {
  if (err) {
    logger.error("❌ ÉCHEC de connexion à PostgreSQL/Supabase", { 
      message: err.message,
      stack: err.stack 
    });
  } else {
    logger.info("✅ Connexion PostgreSQL/Supabase établie avec succès !");
    release(); // Libère le client pour le pool
  }
});

/**
 * Gestionnaire d'erreurs global sur le pool
 */
pool.on("error", (err) => {
  logger.error("Erreur inattendue sur le pool de base de données", err);
});

export default pool;