import { Worker, type Job } from "bullmq";
import { redisOptions } from "../config/redis";
import { EventType } from "./event.types";
import { reminderQueue } from "../queues/reminder.queue";
import { logger } from "../utils/logger";
import { EventPayloadSchemas } from "./event.schemas";

function isEventType(name: unknown): name is EventType {
  return typeof name === "string" && Object.values(EventType).includes(name as EventType);
}

export const eventWorker = new Worker(
  "eventBus",
  async (job: Job) => {
    const name = job.name;

    if (!isEventType(name)) {
      logger.warn("Event name invalide", { name: String(name) });
      return;
    }

    // ✅ validation unique (mêmes schemas que event.bus.ts)
    const parsed = EventPayloadSchemas[name].safeParse(job.data);
    if (!parsed.success) {
      logger.warn("Payload event invalide", {
        event: name,
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      return;
    }

    logger.info("📨 EVENT RECEIVED", { event: name });

    switch (name) {
      case EventType.INVOICE_OVERDUE: {
        const { invoiceId, userId } = parsed.data;

        // ✅ jobId stable => idempotency côté reminderQueue
        await reminderQueue.add(
          "sendReminder",
          { invoiceId, userId },
          {
            jobId: `reminder:${invoiceId}`,
            removeOnComplete: true,
            attempts: 3,
          }
        );

        break;
      }

      default:
        // autres events non traités ici
        break;
    }
  },
  { connection: redisOptions }
);