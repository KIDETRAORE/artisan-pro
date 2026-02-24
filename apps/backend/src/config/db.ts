import { Pool, PoolConfig } from "pg";
import { ENV } from "./env";
import { logger } from "../utils/logger";

/**
 * Configuration du Pool PostgreSQL
 * L'utilisation d'un Pool est indispensable en production pour la scalabilité.
 */
const poolConfig: PoolConfig = {
  connectionString: ENV.DATABASE_URL,
  
  // 🔐 SÉCURITÉ DB : SSL activé en production
  // Supabase et la plupart des providers managés l'exigent
  ssl: ENV.NODE_ENV === "production" 
    ? { rejectUnauthorized: false } // Permet la connexion sécurisée sur les DB managées
    : false,

  // 📈 PERFORMANCE : Gestion du pool
  max: ENV.NODE_ENV === "production" ? 20 : 5, // Max de connexions simultanées
  idleTimeoutMillis: 30000, // Temps avant de fermer une connexion inactive
  connectionTimeoutMillis: 2000, // Temps max pour établir la connexion (Fail fast)
};

const pool = new Pool(poolConfig);

/**
 * Gestion des erreurs de connexion au pool
 */
pool.on("error", (err) => {
  logger.error("❌ Unexpected error on idle database client", err);
  process.exit(-1);
});

/**
 * Helper pour les requêtes avec gestion de log et timeout
 */
export const db = {
  async query(text: string, params?: any[]) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Log uniquement en dev pour éviter de saturer les logs prod
      if (ENV.NODE_ENV === "development") {
        logger.info("Executed query", { text, duration, rows: res.rowCount });
      }
      
      return res;
    } catch (error) {
      logger.error("Database Query Error", { text, error });
      throw error;
    }
  },
  
  // Pour les transactions complexes
  getClient: () => pool.connect(),
};

export default db;