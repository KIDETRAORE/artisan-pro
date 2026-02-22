import { Worker, Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { EventType } from "./event.types";
import { reminderQueue } from "../queues/reminder.queue";
import { logger } from "../utils/logger";

export const eventWorker = new Worker(
  "eventBus",
  async (job: Job) => {
    logger.info(`📨 [EVENT RECEIVED] : ${job.name}`);

    switch (job.name) {
      case EventType.INVOICE_OVERDUE:
        // Au lieu que l'automation appelle la queue de relance, c'est l'event bus
        await reminderQueue.add("sendReminder", job.data);
        break;

      case EventType.INVOICE_PAID:
        logger.info(`💰 Traitement paiement pour client: ${job.data.clientId}`);
        // Ici on appellera plus tard le service de score de risque
        break;

      case EventType.REMINDER_SENT:
        logger.info(`📊 Analytics : Relance enregistrée pour facture ${job.data.invoiceId}`);
        break;

      default:
        logger.warn(`❓ Événement non géré : ${job.name}`);
    }
  },
  { connection: redisOptions }
);