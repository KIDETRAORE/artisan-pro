import { Queue } from "bullmq";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";
import { EventType } from "./event.types";
import { EventPayloadSchemas, type EventPayloadMap } from "./event.schemas";

export const eventBus = new Queue("eventBus", {
  connection: redisOptions,
});

export async function emitEvent<T extends EventType>(
  type: T,
  payload: EventPayloadMap[T]
): Promise<void> {
  // ✅ validation unique
  const parsed = EventPayloadSchemas[type].parse(payload);

  // ✅ idempotency best-effort: event job id stable par type+invoiceId (si présent)
  // (si ton payload n'a pas invoiceId pour certains events, on retombe sur un id "random" géré par BullMQ)
  const invoiceId = (parsed as any)?.invoiceId as string | undefined;
  const jobId = invoiceId ? `event:${type}:${invoiceId}` : undefined;

  try {
    await eventBus.add(type, parsed, {
      jobId,
      removeOnComplete: true,
      attempts: 3,
    });

    logger.debug("📡 EVENT EMITTED", { type });
  } catch (err: unknown) {
    logger.error("❌ EVENT BUS ERROR", {
      type,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}