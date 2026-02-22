import pool from "../config/db";
import { runAI } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";
// 🔥 NOUVEAUX IMPORTS POUR LES EVENTS
import { emitEvent } from "../events/event.bus";
import { EventType } from "../events/event.types";

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function runReminderAutomation() {
  logger.info("🚀 Lancement de l'automation des relances (Mode Event-Driven)...");

  const result = await pool.query(`
    SELECT i.*, p.full_name as artisan_name, p.company_name
    FROM invoices i
    JOIN profiles p ON i.user_id = p.id
    WHERE i.status = 'UNPAID' AND i.due_date < NOW()
  `);

  if (result.rows.length === 0) {
    logger.info("✅ Aucune facture en retard à relancer.");
    return;
  }

  for (const invoice of result.rows) {
    try {
      if (invoice.last_reminder_at) {
        const lastDate = new Date(invoice.last_reminder_at).getTime();
        const diffDays = (Date.now() - lastDate) / (1000 * 3600 * 24);
        if (diffDays < 7) {
          logger.debug(`⏩ Saut de la facture ${invoice.id} (déjà relancée récemment)`);
          continue;
        }
      }

      const prompt = `Rédige un email de relance cordial mais ferme pour le client ${invoice.client_name}. 
      Détails de la facture :
      - Numéro : ${invoice.id}
      - Montant dû : ${invoice.total_amount}€
      - Entreprise émettrice : ${invoice.company_name}
      L'email doit être complet et professionnel.`;

      logger.info(`🤖 Génération IA (Module RELANCE) pour ${invoice.client_name}...`);
      
      const aiResponseRaw = await runAI("relance", { prompt, userId: invoice.user_id });

      let finalEmailContent: string;
      try {
        const parsed = JSON.parse(aiResponseRaw);
        finalEmailContent = parsed.answer || aiResponseRaw;
      } catch (e) {
        finalEmailContent = aiResponseRaw.replace(/```json|```/g, "").trim();
      }

      if (finalEmailContent.includes("Je ne peux pas") || finalEmailContent.includes("Ma fonction est")) {
        logger.error(`⚠️ L'IA a refusé la rédaction pour ${invoice.client_name}.`);
        continue;
      }

      /**
       * 🔵 ÉTAPE 3 DU PLAN : DÉCLENCHER L'EVENT
       * On ne parle plus à la reminderQueue ici.
       */
      await emitEvent(EventType.INVOICE_OVERDUE, {
        invoiceId: invoice.id,
        email: invoice.client_email,
        clientName: invoice.client_name,
        content: finalEmailContent,
        userId: invoice.user_id,
        totalAmount: invoice.total_amount,
        clientId: invoice.client_id
      });

      logger.info(`📡 Événement INVOICE_OVERDUE émis pour ${invoice.client_name}`);

      await delay(4000);

    } catch (error: any) {
      logger.error(`❌ Échec du traitement pour la facture ${invoice.id}:`, error.message);
      continue;
    }
  }
  
  logger.info("🏁 Fin de l'automation des relances.");
}