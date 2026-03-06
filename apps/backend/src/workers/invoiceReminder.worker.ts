// apps/backend/src/workers/invoiceReminder.worker.ts
import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { redisOptions } from "../config/redis";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";

// ✅ MODIF: utiliser le vrai service email Resend
import { sendReminderEmail } from "../services/email.service";
// ✅ MODIF: ne pas logger l'email en clair
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
  paymentLink: string;
}) {
  const subject = `Relance facture ${params.invoiceNumber}`;

  const text = [
    "Bonjour,",
    "",
    `La facture ${params.invoiceNumber} d'un montant de ${params.amount}`,
    `arrivée à échéance le ${params.dueDate} semble toujours impayée.`,
    "",
    "Vous pouvez la régler ici :",
    params.paymentLink,
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
      Vous pouvez la régler ici :
      <br />
      <a href="${params.paymentLink}">${params.paymentLink}</a>
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
      .from("invoices")
      .select(
        "id, user_id, client_email, client_name, invoice_number, due_date, status, total_amount_cents, reminder_count, last_reminder_at"
      )
      .eq("id", payload.invoiceId)
      .eq("user_id", payload.userId)
      .maybeSingle();

    if (invoiceErr) {
      logger.error("InvoiceReminderWorker: failed to load invoice", {
        invoiceId: payload.invoiceId,
        userId: payload.userId,
        message: invoiceErr.message,
      });
      throw new HttpError(500, "Failed to load invoice");
    }

    if (!invoice) {
      logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Invoice not found", {
        invoiceId: payload.invoiceId,
        userId: payload.userId,
      });
      return { ok: false, reason: "invoice_not_found" };
    }

    const status = String((invoice as any).status ?? "").toLowerCase();
    if (status === "paid" || status === "canceled") {
      logger.info("⏭️ [WORKER-INVOICE-REMINDER] Skip closed invoice", {
        invoiceId: payload.invoiceId,
        status,
      });
      return { ok: true, skipped: true, reason: "invoice_closed" };
    }

    const clientEmail = String((invoice as any).client_email ?? "").trim();
    if (!clientEmail) {
      logger.warn("⚠️ [WORKER-INVOICE-REMINDER] Skip missing client_email", {
        invoiceId: payload.invoiceId,
      });
      return { ok: true, skipped: true, reason: "missing_client_email" };
    }

    const invoiceNumber =
      String((invoice as any).invoice_number ?? "").trim() ||
      `#${String((invoice as any).id).slice(0, 8)}`;

    const amountCents = Number((invoice as any).total_amount_cents ?? 0);
    const dueDate = new Date(String((invoice as any).due_date)).toLocaleDateString(
      "fr-FR"
    );

    // ⚠️ À remplacer plus tard par un vrai lien de paiement si tu branches Stripe
    const paymentLink = "https://example.com/paiement";

    const email = buildReminderEmail({
      invoiceNumber,
      amount: formatAmountCents(amountCents),
      dueDate,
      paymentLink,
    });

    // ✅ MODIF: envoi réel via Resend (service centralisé)
    // On passe email.text -> email.service transforme en HTML via <br>
    await sendReminderEmail(clientEmail, email.subject, email.text);

    const currentReminderCount = Number((invoice as any).reminder_count ?? 0);

    const { error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({
        reminder_count: currentReminderCount + 1,
        last_reminder_at: new Date().toISOString(),
        status: status === "sent" ? "overdue" : (invoice as any).status,
      })
      .eq("id", payload.invoiceId)
      .eq("user_id", payload.userId);

    if (updateErr) {
      logger.error("InvoiceReminderWorker: failed to update reminder fields", {
        invoiceId: payload.invoiceId,
        userId: payload.userId,
        message: updateErr.message,
      });
      throw new HttpError(500, "Failed to update invoice reminder state");
    }

    // ✅ MODIF: ne pas logger l'email client en clair
    const toSafe = redactEmail(clientEmail);

    logger.info("✅ [WORKER-INVOICE-REMINDER] Reminder sent", {
      jobId: job.id,
      invoiceId: payload.invoiceId,
      userId: payload.userId,
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