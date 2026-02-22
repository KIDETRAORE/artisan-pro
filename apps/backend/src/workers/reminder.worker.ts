import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { sendReminderEmail } from "../services/email.service";
import pool from "../config/db";
import { logger } from "../utils/logger";
// 🔥 NOUVEAUX IMPORTS POUR L'ARCHITECTURE EVENT-DRIVEN
import { emitEvent } from "../events/event.bus";
import { EventType } from "../events/event.types";

logger.info("👷 [WORKER] Chargement du fichier reminder.worker...");

export const reminderWorker = new Worker(
  "reminderQueue",
  async (job: Job) => {
    logger.info(`🔥 [WORKER] JOB REÇU ! ID: ${job.id} pour ${job.data.clientName}`);

    const { invoiceId, email, clientName, content } = job.data;

    try {
      const subject = `Relance facture - ${clientName}`;
      
      if (!email) throw new Error("Email du client manquant");

      /**
       * 🧹 NETTOYAGE DU CONTENU
       * Extraction du texte propre au cas où le payload contient du JSON
       */
      let finalBody = content;
      
      if (typeof content === "string" && content.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(content);
          finalBody = parsed.answer || content;
        } catch (e) {
          finalBody = content.replace(/```json|```/g, "").trim();
        }
      }

      // 1. Envoi de l'email via Resend
      await sendReminderEmail(email, subject, finalBody);

      // 2. Mise à jour de la base de données (Tracking)
      await pool.query(
        `UPDATE invoices 
         SET last_reminder_at = NOW(), 
             reminder_count = COALESCE(reminder_count, 0) + 1 
         WHERE id = $1`,
        [invoiceId]
      );

      /**
       * 🔵 ÉTAPE 5 DU PLAN : ÉMETTRE L'EVENT DE RÉUSSITE
       * On informe le système que la relance est bien partie.
       */
      await emitEvent(EventType.REMINDER_SENT, {
        invoiceId,
        clientName,
        sentAt: new Date()
      });

      logger.info(`✅ [WORKER] Succès pour ${clientName} et Event REMINDER_SENT émis.`);
    } catch (error: any) {
      logger.error(`💥 [WORKER] Erreur sur job ${job.id}: ${error.message}`);
      throw error; 
    }
  },
  { 
    connection: redisOptions,
    concurrency: 1 
  }
);

// --- LOGS DE DIAGNOSTIC ---

reminderWorker.on("ready", () => {
  logger.info("🚀 [WORKER] Connecté à Redis et prêt à traiter les relances !");
});

reminderWorker.on("error", (err) => {
  logger.error("⚠️ [WORKER] Erreur de connexion Redis :", err.message);
});

reminderWorker.on("completed", (job) => {
  logger.info(`✅ [WORKER] Job ${job.id} terminé.`);
});

reminderWorker.on("failed", (job, err) => {
  logger.error(`❌ [WORKER] Job ${job?.id} a échoué: ${err.message}`);
});