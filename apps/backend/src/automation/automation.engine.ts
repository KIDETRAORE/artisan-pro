// apps/backend/src/automation/automation.engine.ts
import pool from "../config/db";
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
 * - sélection candidates (faible charge)
 * - lock par facture (FOR UPDATE SKIP LOCKED)
 * - update last_reminder_at uniquement après succès (emitEvent)
 */
export async function runReminderAutomation() {
  logger.info("🚀 Automation relances - start");

  // 1) Liste d’IDs candidats (léger)
  const candidatesResult = await pool.query(
    `
    SELECT i.id
    FROM invoices i
    WHERE i.status = 'unpaid'
      AND i.due_date < NOW()
      AND (i.last_reminder_at IS NULL OR i.last_reminder_at < NOW() - INTERVAL '7 days')
    ORDER BY i.due_date ASC
    LIMIT 200
    `
  );

  const candidates: Array<{ id: string }> = (candidatesResult?.rows ?? []) as any;

  if (candidates.length === 0) {
    logger.info("✅ Aucune facture en retard à relancer.");
    return;
  }

  for (const row of candidates) {
    const invoiceId = row.id;

    // 2) Client DB via ton wrapper
    const client = await pool.getClient();

    try {
      await client.query("BEGIN");

      // 3) Lock atomique + re-check conditions
      const lockedResult = await client.query(
        `
        SELECT
          i.id,
          i.user_id
        FROM invoices i
        WHERE i.id = $1
          AND i.status = 'unpaid'
          AND i.due_date < NOW()
          AND (i.last_reminder_at IS NULL OR i.last_reminder_at < NOW() - INTERVAL '7 days')
        FOR UPDATE SKIP LOCKED
        `,
        [invoiceId]
      );

      if (!lockedResult.rows?.length) {
        await client.query("ROLLBACK");
        continue;
      }

      const invoice = lockedResult.rows[0] as {
        id: string;
        user_id: string;
      };

      // 4) Emit event minimal (validation unique côté event.bus.ts via Zod schemas)
      await emitEvent(EventType.INVOICE_OVERDUE, {
        invoiceId: invoice.id,
        userId: invoice.user_id,
      });

      // 5) Idempotency persistée après succès
      await client.query(`UPDATE invoices SET last_reminder_at = NOW() WHERE id = $1`, [
        invoice.id,
      ]);

      await client.query("COMMIT");

      logger.info("📡 Event INVOICE_OVERDUE émis", { invoiceId: invoice.id });

      // Throttle pour éviter burst
      await delay(500);
    } catch (err: unknown) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }

      logger.error("❌ Automation relance: erreur", {
        invoiceId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client.release();
    }
  }

  logger.info("🏁 Automation relances - end");
}