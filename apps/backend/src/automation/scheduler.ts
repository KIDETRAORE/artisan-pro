import cron from "node-cron";
import { runReminderAutomation } from "./automation.engine";
import { logger } from "../utils/logger";

/**
 * Configuration des tâches planifiées
 */
export const initScheduler = () => {
  logger.info("⏰ Scheduler initialisé");

  // Planification : Tous les jours à 08h00 du matin
  // Syntaxe : (minute heure jour-du-mois mois jour-de-la-semaine)
  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        logger.info("🚀 [CRON] Lancement automatique des relances de 08:00...");
        await runReminderAutomation();
        logger.info("✅ [CRON] Relances terminées avec succès.");
      } catch (error: any) {
        logger.error("❌ [CRON ERROR] Échec de la tâche automatique", {
          error: error.message,
        });
      }
    },
    {
      timezone: "Europe/Paris", // L'heure sera basée sur ce fuseau
    }
  );

  // Tâche de "Nettoyage" tous les dimanches à minuit
  cron.schedule("0 0 * * 0", () => {
    logger.info("🧹 Nettoyage hebdomadaire des logs et fichiers temporaires...");
  });
};