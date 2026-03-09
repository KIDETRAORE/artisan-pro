// apps/backend/src/automation/automation.engine.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { emitEvent } from "../events/event.bus";
import { EventType } from "../events/event.types";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Automation relances (Event-driven)
 *
 * Objectif: émettre uniquement un event minimal { invoiceId, userId }
 * - Pas de contenu email
 * - Pas de PII
 * - Pas d’appel IA ici (sera fait dans reminder.worker.ts)
 *
 * Idempotency:
 * - locking + sélection candidates via RPC (DB)
 * - update last_reminder_at via RPC après succès (mark_invoice_reminded)
 */
export async function runReminderAutomation() {
  logger.info("🚀 Automation relances - start");

  const cooldownDays = Number(process.env.REMINDER_COOLDOWN_DAYS ?? "7");

  // On tente jusqu'à 200 jobs max (équivalent à ton LIMIT 200)
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabaseAdmin.rpc("take_next_invoice_to_remind", {
      now_ts: new Date().toISOString(),
      cooldown_days: cooldownDays,
    });
    if (error) throw error;

    const job = data?.[0];
    if (!job) break; // plus rien à traiter

    await emitEvent(EventType.INVOICE_OVERDUE, {
      invoiceId: job.invoice_id,
      userId: job.user_id,
    });

    await supabaseAdmin.rpc("mark_invoice_reminded", {
      invoice_id: job.invoice_id,
      now_ts: new Date().toISOString(),
    });

    logger.info("📡 Event INVOICE_OVERDUE émis", { invoiceId: job.invoice_id });

    // Throttle pour éviter burst
    await delay(500);
  }

  logger.info("🏁 Automation relances - end");
}