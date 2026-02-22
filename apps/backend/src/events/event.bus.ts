import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";

// Le bus d'événements est une queue BullMQ dédiée
export const eventBus = new Queue("eventBus", {
  connection: redisOptions,
});

export async function emitEvent(type: string, payload: any) {
  try {
    await eventBus.add(type, payload, {
      removeOnComplete: true,
      attempts: 3, // Sécurité : si l'émission échoue, on réessaie
    });
    logger.debug(`📡 [EVENT EMITTED] : ${type}`);
  } catch (error) {
    logger.error(`❌ [EVENT BUS ERROR] : ${type}`, error);
  }
}