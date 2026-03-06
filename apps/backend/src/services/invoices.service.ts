// apps/backend/src/services/invoices.service.ts
import { z } from "zod";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

// ✅ Gardé: la queue sert maintenant au bon moment (finalisation)
import { integrationQueue } from "../queues/integration.queue";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";

export type InvoiceRow = {
  id: string;
  user_id: string;
  client_name: string;
  client_email: string | null;
  total_amount: number;
  status: string;
  due_date: string;
  last_reminder_at: string | null;
  reminder_count: number;
  created_at: string;

  // ✅ AJOUT: liaison facture ↔ chantier
  project_id: string | null;

  // ✅ AJOUT: numérotation facture
  invoice_number?: string | null;

  // ✅ AJOUT: totaux en cents (si présents en DB)
  total_amount_cents?: number | null;
  subtotal_cents?: number | null;
  tax_amount_cents?: number | null;

  // ✅ AJOUT: issue_date (si présent en DB)
  issue_date?: string | null;

  // (éventuels champs ajoutés par migration paiement)
  stripe_checkout_id?: string | null;
  paid_at?: string | null;
};

const CreateInvoiceSchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email().optional().nullable(),
  total_amount: z.number().finite().nonnegative(),
  due_date: z.string().min(1),

  project_id: z.string().uuid().optional().nullable(),

  status: z
    .enum(["draft", "sent", "paid", "overdue", "canceled"])
    .optional()
    .default("sent"),
});

const UpdateInvoiceSchema = z.object({
  client_name: z.string().min(1).optional(),
  client_email: z.string().email().optional().nullable(),
  total_amount: z.number().finite().nonnegative().optional(),
  due_date: z.string().min(1).optional(),
  project_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "sent", "paid", "overdue", "canceled"]).optional(),
});

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {
  // apiVersion: "2024-06-20",
});

function normalizeStatus(s: unknown): string {
  return String(s ?? "").toLowerCase().trim();
}

function toCentsFallback(invoice: InvoiceRow): number {
  const cents = (invoice as any).total_amount_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.round(cents);

  const eur = invoice.total_amount;
  if (typeof eur === "number" && Number.isFinite(eur)) return Math.round(eur * 100);

  return 0;
}

async function invoiceHasLines(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id")
    .eq("invoice_id", invoiceId)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn("InvoicesService.invoiceHasLines failed", {
      invoiceId,
      message: error.message,
    });
    return false;
  }

  return !!data;
}

// ✅ MODIF UNIQUE : ajout dedupe + retry + backoff BullMQ
async function enqueuePennylanePush(params: { userId: string; invoiceId: string }) {
  try {
    await integrationQueue.add(
      "push_invoice",
      {
        type: "push_invoice",
        userId: params.userId,
        invoiceId: params.invoiceId,
        provider: "pennylane",
      },
      {
        jobId: `push_invoice:pennylane:${params.invoiceId}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );
  } catch {
    logger.warn("InvoicesService.enqueuePennylanePush failed", {
      userId: params.userId,
      invoiceId: params.invoiceId,
    });
  }
}

export class InvoicesService {
  static async createInvoice(userId: string, input: unknown): Promise<InvoiceRow> {
    const parsed = CreateInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoice payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        user_id: userId,
        client_name: payload.client_name,
        client_email: payload.client_email ?? null,
        total_amount: payload.total_amount,
        due_date: payload.due_date,
        project_id: payload.project_id ?? null,
        status: payload.status,
      })
      .select("*")
      .single();

    if (error) {
      logger.error("InvoicesService.createInvoice failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create invoice");
    }

    return data as InvoiceRow;
  }

  static async listInvoices(userId: string): Promise<InvoiceRow[]> {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("InvoicesService.listInvoices failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list invoices");
    }

    return (data ?? []) as InvoiceRow[];
  }

  static async getInvoice(userId: string, invoiceId: string): Promise<InvoiceRow> {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("InvoicesService.getInvoice failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load invoice");
    }

    if (!data) {
      throw new HttpError(404, "Invoice not found");
    }

    return data as InvoiceRow;
  }

  static async updateInvoice(
    userId: string,
    invoiceId: string,
    input: unknown
  ): Promise<InvoiceRow> {
    const parsed = UpdateInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoice payload");
    }

    const patch = parsed.data;

    const before = await InvoicesService.getInvoice(userId, invoiceId);
    const beforeStatus = normalizeStatus(before.status);

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .update(patch)
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      logger.error("InvoicesService.updateInvoice failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update invoice");
    }

    const updated = data as InvoiceRow;

    const afterStatus = normalizeStatus(updated.status);
    const wantsFinalizationSync =
      normalizeStatus(patch.status) === "sent" &&
      beforeStatus !== "sent" &&
      afterStatus === "sent";

    if (wantsFinalizationSync) {
      const hasLines = await invoiceHasLines(updated.id);
      if (hasLines) {
        await enqueuePennylanePush({ userId, invoiceId: updated.id });
      } else {
        logger.info("InvoicesService.updateInvoice skip sync: no lines", {
          userId,
          invoiceId: updated.id,
        });
      }
    }

    return updated;
  }

  static async deleteInvoice(userId: string, invoiceId: string): Promise<void> {
    await InvoicesService.getInvoice(userId, invoiceId);

    const { error } = await supabaseAdmin
      .from("invoices")
      .delete()
      .eq("id", invoiceId)
      .eq("user_id", userId);

    if (error) {
      logger.error("InvoicesService.deleteInvoice failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to delete invoice");
    }
  }

  static async finalizeInvoice(userId: string, invoiceId: string): Promise<InvoiceRow> {
    const invoice = await InvoicesService.getInvoice(userId, invoiceId);

    const status = normalizeStatus(invoice.status);
    if (status === "paid" || status === "canceled") {
      throw new HttpError(409, "Invoice cannot be finalized in its current state");
    }

    const hasLines = await invoiceHasLines(invoiceId);
    if (!hasLines) {
      throw new HttpError(400, "Cannot finalize invoice without lines");
    }

    const { error: rpcErr } = await supabaseAdmin.rpc(
      "recompute_invoice_totals_cents",
      { p_invoice_id: invoiceId }
    );

    if (rpcErr) {
      logger.error(
        "InvoicesService.finalizeInvoice recompute_invoice_totals_cents failed",
        { userId, invoiceId, message: rpcErr.message }
      );
      throw new HttpError(500, "Failed to recompute invoice totals");
    }

    let nextInvoiceNumber: string | null = null;

    if ((invoice as any).invoice_number == null) {
      const { data: num, error: numErr } = await supabaseAdmin.rpc(
        "generate_invoice_number",
        { p_user_id: userId }
      );

      if (numErr) {
        logger.error(
          "InvoicesService.finalizeInvoice generate_invoice_number failed",
          { userId, invoiceId, message: numErr.message }
        );
        throw new HttpError(500, "Failed to generate invoice number");
      }

      nextInvoiceNumber = String(num ?? "");
      if (!nextInvoiceNumber || nextInvoiceNumber.trim().length === 0) {
        throw new HttpError(500, "Failed to generate invoice number");
      }
    }

    const patch: Record<string, unknown> = { status: "sent" };

    if ((invoice as any).issue_date == null) {
      patch.issue_date = new Date().toISOString();
    }

    if (nextInvoiceNumber) {
      patch.invoice_number = nextInvoiceNumber;
    }

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .update(patch)
      .eq("id", invoiceId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      logger.error("InvoicesService.finalizeInvoice update failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to finalize invoice");
    }

    await enqueuePennylanePush({ userId, invoiceId });

    return data as InvoiceRow;
  }

  /**
   * ✅ AJOUT: createPaymentSession
   * - Crée une Stripe Checkout Session (mode payment)
   * - Stocke stripe_checkout_id sur invoices
   * - Renvoie { id, url }
   */
  static async createPaymentSession(
    userId: string,
    invoiceId: string
  ): Promise<{ id: string; url: string }> {
    const invoice = await InvoicesService.getInvoice(userId, invoiceId);

    const status = normalizeStatus(invoice.status);
    if (status === "paid" || status === "canceled") {
      throw new HttpError(409, "Invoice cannot be paid in its current state");
    }

    if (!invoice.client_email) {
      throw new HttpError(400, "Client email required for payment");
    }

    const amountCents = toCentsFallback(invoice);
    if (amountCents <= 0) {
      throw new HttpError(400, "Invoice amount must be > 0");
    }

    const frontUrl =
      String((ENV as any).FRONT_URL ?? (ENV as any).FRONTEND_URL ?? "").trim() ||
      "http://localhost:5173";

    const label = invoice.invoice_number
      ? `Facture ${invoice.invoice_number}`
      : `Facture ${String(invoice.id).slice(0, 8)}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: invoice.client_email,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: label },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${frontUrl}/invoice-paid`,
      cancel_url: `${frontUrl}/invoices/${invoice.id}`,
      metadata: {
        invoiceId: invoice.id,
        userId,
      },
    });

    await supabaseAdmin
      .from("invoices")
      .update({
        stripe_checkout_id: session.id,
      })
      .eq("id", invoice.id)
      .eq("user_id", userId);

    const url = session.url;
    if (!url) {
      throw new HttpError(502, "Stripe session url missing");
    }

    return { id: session.id, url };
  }
}