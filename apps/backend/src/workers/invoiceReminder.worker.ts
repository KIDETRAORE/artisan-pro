// apps/backend/src/workers/invoiceReminder.worker.ts
import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { redisOptions } from "../config/redis";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { sendReminderEmail } from "../services/email.service";
import { redactEmail } from "../utils/redact";

const InvoiceReminderJobSchema = z.object({
  invoiceId: z.string().uuid(),
  userId: z.string().uuid(),
});

type InvoiceReminderJob = z.infer<typeof InvoiceReminderJobSchema>;

function parseJobData(data: unknown): InvoiceReminderJob {
  const parsed = InvoiceReminderJobSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Invalid job payload", {
      issues: parsed.error.issues,
    });
    throw new Error("invalid_job_payload");
  }
  return parsed.data;
}

function formatAmountCents(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format((cents ?? 0) / 100);
}

function buildReminderEmail(params: {
  invoiceNumber: string;
  amount: string;
  dueDate: string;
}) {
  const subject = `Relance facture ${params.invoiceNumber}`;

  const text = [
    "Bonjour,",
    "",
    `La facture ${params.invoiceNumber} d'un montant de ${params.amount}`,
    `arrivée à échéance le ${params.dueDate} semble toujours impayée.`,
    "",
    "Merci de bien vouloir procéder au règlement dans les meilleurs délais.",
    "",
    "Si le paiement a déjà été effectué, vous pouvez ignorer ce message.",
    "",
    "Merci",
  ].join("\n");

  const html = `
    <p>Bonjour,</p>
    <p>
      La facture <strong>${params.invoiceNumber}</strong> d'un montant de
      <strong>${params.amount}</strong><br />
      arrivée à échéance le <strong>${params.dueDate}</strong> semble toujours impayée.
    </p>
    <p>
      Merci de bien vouloir procéder au règlement dans les meilleurs délais.
    </p>
    <p>
      Si le paiement a déjà été effectué, vous pouvez ignorer ce message.
    </p>
    <p>Merci</p>
  `;

  return { subject, text, html };
}

export const invoiceReminderWorker = new Worker(
  "reminderQueue",
  async (job: Job) => {
    if (job.name !== "invoice_reminder") {
      logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Unknown job name", {
        jobId: job.id,
        name: job.name,
      });
      return { ok: false, reason: "unknown_job_name" };
    }

    const payload = parseJobData(job.data);

    logger.info("🔁 [WORKER-INVOICE-REMINDER] Job start", {
      jobId: job.id,
      invoiceId: payload.invoiceId,
      userId: payload.userId,
    });

    const { data: invoice, error: invoiceErr } = await supabaseAdmin
      .from("sales_invoices")
      .select(
        "id, user_id, contact_id, invoice_number, due_date, status, total_amount_cents, reminder_count, last_reminder_at"
      )
      .eq("id", payload.invoiceId)
      .eq("user_id", payload.userId)
      .maybeSingle();

    if (invoiceErr) {
      logger.error("InvoiceReminderWorker: failed to load sales invoice", {
        invoiceId: payload.invoiceId,
        userId: payload.userId,
        message: invoiceErr.message,
      });
      throw new HttpError(500, "Failed to load sales invoice");
    }

    if (!invoice) {
      logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Sales invoice not found", {
        invoiceId: payload.invoiceId,
        userId: payload.userId,
      });
      return { ok: false, reason: "invoice_not_found" };
    }

    const status = String(invoice.status ?? "").toLowerCase();
    if (status === "paid" || status === "cancelled") {
      logger.info("⏭️ [WORKER-INVOICE-REMINDER] Skip closed sales invoice", {
        invoiceId: payload.invoiceId,
        status,
      });
      return { ok: true, skipped: true, reason: "invoice_closed" };
    }

    if (!invoice.contact_id) {
      logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Skip missing contact_id", {
        invoiceId: payload.invoiceId,
      });
      return { ok: true, skipped: true, reason: "missing_contact_id" };
    }

    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, email, name")
      .eq("id", invoice.contact_id)
      .eq("user_id", payload.userId)
      .maybeSingle();

    if (contactErr) {
      logger.error("InvoiceReminderWorker: failed to load contact", {
        invoiceId: payload.invoiceId,
        userId: payload.userId,
        contactId: invoice.contact_id,
        message: contactErr.message,
      });
      throw new HttpError(500, "Failed to load invoice contact");
    }

    const clientEmail = String(contact?.email ?? "").trim();
    if (!clientEmail) {
      logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Skip missing contact email", {
        invoiceId: payload.invoiceId,
        contactId: invoice.contact_id,
      });
      return { ok: true, skipped: true, reason: "missing_client_email" };
    }

    const invoiceNumber =
      String(invoice.invoice_number ?? "").trim() ||
      `#${String(invoice.id).slice(0, 8)}`;

    const amountCents = Number(invoice.total_amount_cents ?? 0);
    const dueDateRaw = String(invoice.due_date ?? "").trim();
    const dueDate = dueDateRaw
      ? new Date(dueDateRaw).toLocaleDateString("fr-FR")
      : "date inconnue";

    const email = buildReminderEmail({
      invoiceNumber,
      amount: formatAmountCents(amountCents),
      dueDate,
    });

    await sendReminderEmail(clientEmail, email.subject, email.text);

    const currentReminderCount = Number(invoice.reminder_count ?? 0);

    const { error: updateErr } = await supabaseAdmin
      .from("sales_invoices")
      .update({
        reminder_count: currentReminderCount + 1,
        last_reminder_at: new Date().toISOString(),
        status: status === "sent" ? "overdue" : invoice.status,
      })
      .eq("id", payload.invoiceId)
      .eq("user_id", payload.userId);

    if (updateErr) {
      logger.error(
        "InvoiceReminderWorker: failed to update sales invoice reminder fields",
        {
          invoiceId: payload.invoiceId,
          userId: payload.userId,
          message: updateErr.message,
        }
      );
      throw new HttpError(500, "Failed to update invoice reminder state");
    }

    const toSafe = redactEmail(clientEmail);

    logger.info("✅ [WORKER-INVOICE-REMINDER] Reminder sent", {
      jobId: job.id,
      invoiceId: payload.invoiceId,
      userId: payload.userId,
      contactId: invoice.contact_id,
      contactName: contact?.name ?? null,
      toMasked: toSafe.masked,
      toDomain: toSafe.domain,
      toHash: toSafe.hash,
    });

    return {
      ok: true,
      invoiceId: payload.invoiceId,
      userId: payload.userId,
      to: toSafe.masked,
    };
  },
  {
    connection: redisOptions,
  }
);

logger.info("👷 [WORKER-INVOICE-REMINDER] Worker loaded");