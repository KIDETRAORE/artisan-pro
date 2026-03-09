// apps/backend/src/services/invoices.service.ts
import { z } from "zod";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { integrationQueue } from "../queues/integration.queue";
import { reminderQueue } from "../queues/reminder.queue";
import {
  AccountingMatchingService,
  type AccountingSource,
} from "./accountingMatching.service";
import { ExternalIdMapService } from "./externalIdMap.service";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";
export type InvoiceOriginType = "manual" | "quote" | "compta_import";

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
  project_id: string | null;
  invoice_number?: string | null;
  origin_type?: InvoiceOriginType | string | null;
  source_system?: string | null;
  source_external_id?: string | null;
  total_amount_cents?: number | null;
  subtotal_cents?: number | null;
  tax_amount_cents?: number | null;
  issue_date?: string | null;
  stripe_checkout_id?: string | null;
  paid_at?: string | null;
};

const CreateInvoiceSchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email().optional().nullable(),
  total_amount: z.number().finite().nonnegative(),
  due_date: z.string().min(1),
  project_id: z.string().uuid().optional().nullable(),
  invoice_number: z.string().min(1).optional().nullable(),
  origin_type: z
    .enum(["manual", "quote", "compta_import"])
    .optional()
    .default("manual"),
  source_system: z.string().min(1).optional().nullable(),
  source_external_id: z.string().optional().nullable(),
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
  invoice_number: z.string().min(1).optional().nullable(),
  origin_type: z
    .enum(["manual", "quote", "compta_import"])
    .optional()
    .nullable(),
  source_system: z.string().min(1).optional().nullable(),
  source_external_id: z.string().optional().nullable(),
  status: z.enum(["draft", "sent", "paid", "overdue", "canceled"]).optional(),
});

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {});

function normalizeStatus(s: unknown): string {
  return String(s ?? "").toLowerCase().trim();
}

function toCentsFallback(invoice: InvoiceRow): number {
  const cents = (invoice as any).total_amount_cents;
  if (typeof cents === "number" && Number.isFinite(cents))
    return Math.round(cents);

  const eur = invoice.total_amount;
  if (typeof eur === "number" && Number.isFinite(eur))
    return Math.round(eur * 100);

  return 0;
}

function toAccountingSource(params: {
  originType: InvoiceOriginType | string | null | undefined;
  sourceSystem: string | null | undefined;
}): AccountingSource {
  const sourceSystem = String(params.sourceSystem ?? "").trim().toLowerCase();

  if (sourceSystem === "pennylane") {
    return "pennylane";
  }

  if (sourceSystem === "odoo") {
    return "odoo";
  }

  if (sourceSystem === "file_import" || params.originType === "compta_import") {
    return "file_import";
  }

  if (sourceSystem === "artisanpro") {
    return "artisanpro";
  }

  return "manual";
}

function resolveSourceSystem(params: {
  originType: InvoiceOriginType | string | null | undefined;
  sourceSystem: string | null | undefined;
}): string {
  const sourceSystem = String(params.sourceSystem ?? "").trim().toLowerCase();

  if (sourceSystem.length > 0) {
    return sourceSystem;
  }

  if (params.originType === "compta_import") {
    return "file_import";
  }

  return "artisanpro";
}

async function syncInvoiceExternalMapping(params: {
  userId: string;
  sourceSystem: string;
  sourceExternalId: string | null | undefined;
  invoiceId: string;
  matchConfidence?: "exact" | "high" | "probable" | "manual";
}): Promise<void> {
  const sourceSystem = String(params.sourceSystem ?? "").trim();
  const sourceExternalId = String(params.sourceExternalId ?? "").trim();

  if (!sourceSystem || !sourceExternalId) {
    return;
  }

  await ExternalIdMapService.upsertExternalMapping({
    userId: params.userId,
    sourceSystem: toAccountingSource({
      originType: null,
      sourceSystem,
    }),
    externalEntityType: "invoice",
    externalId: sourceExternalId,
    internalEntityType: "invoice",
    internalId: params.invoiceId,
    matchConfidence: params.matchConfidence ?? "manual",
  });
}

function assertInvoiceUpdateAllowed(
  beforeStatus: string,
  patch: Record<string, unknown>
): void {
  if (beforeStatus === "paid" || beforeStatus === "canceled") {
    throw new HttpError(409, "Invoice is read-only in its current state");
  }

  if (beforeStatus === "sent" || beforeStatus === "overdue") {
    const allowedFields = new Set(["client_email", "due_date", "project_id"]);
    const patchKeys = Object.keys(patch);

    const hasForbiddenField = patchKeys.some((key) => !allowedFields.has(key));
    if (hasForbiddenField) {
      throw new HttpError(
        409,
        "Only client_email, due_date and project_id can be edited once invoice is sent"
      );
    }
  }
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

async function enqueuePennylanePush(params: {
  userId: string;
  invoiceId: string;
}) {
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
    const normalizedSourceSystem = resolveSourceSystem({
      originType: payload.origin_type,
      sourceSystem: payload.source_system,
    });

    const match = await AccountingMatchingService.matchInvoiceCandidate(userId, {
      sourceSystem: toAccountingSource({
        originType: payload.origin_type,
        sourceSystem: normalizedSourceSystem,
      }),
      sourceExternalId: payload.source_external_id ?? null,
      invoiceNumber: payload.invoice_number ?? null,
      clientName: payload.client_name ?? null,
      issueDate: null,
      dueDate: payload.due_date ?? null,
      totalAmountCents: Math.round(payload.total_amount * 100),
    });

    if (
      (match.decision === "link_existing" ||
        match.decision === "ignore_lower_priority") &&
      match.matchedInvoiceId
    ) {
      await syncInvoiceExternalMapping({
        userId,
        sourceSystem: normalizedSourceSystem,
        sourceExternalId: payload.source_external_id,
        invoiceId: match.matchedInvoiceId,
        matchConfidence:
          match.confidence === "manual_required" ? "manual" : match.confidence,
      });

      return await InvoicesService.getInvoice(userId, match.matchedInvoiceId);
    }

    if (match.decision === "flag_conflict") {
      throw new HttpError(409, match.reason);
    }

    if (match.decision === "upgrade_source" && match.matchedInvoiceId) {
      const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({
          origin_type: payload.origin_type ?? "manual",
          source_system: normalizedSourceSystem,
          source_external_id: payload.source_external_id ?? null,
        })
        .eq("id", match.matchedInvoiceId)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) {
        logger.error("InvoicesService.createInvoice upgrade_source failed", {
          userId,
          invoiceId: match.matchedInvoiceId,
          message: error.message,
        });
        throw new HttpError(500, "Failed to upgrade invoice source");
      }

      await syncInvoiceExternalMapping({
        userId,
        sourceSystem: normalizedSourceSystem,
        sourceExternalId: payload.source_external_id,
        invoiceId: data.id,
        matchConfidence:
          match.confidence === "manual_required" ? "manual" : match.confidence,
      });

      return data as InvoiceRow;
    }

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
        invoice_number: payload.invoice_number ?? null,
        origin_type: payload.origin_type ?? "manual",
        source_system: normalizedSourceSystem,
        source_external_id: payload.source_external_id ?? null,
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

    await syncInvoiceExternalMapping({
      userId,
      sourceSystem: normalizedSourceSystem,
      sourceExternalId: payload.source_external_id,
      invoiceId: data.id,
      matchConfidence:
        match.confidence === "manual_required" ? "manual" : match.confidence,
    });

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

    assertInvoiceUpdateAllowed(beforeStatus, patch);

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
    const invoice = await InvoicesService.getInvoice(userId, invoiceId);
    const status = normalizeStatus(invoice.status);

    if (status !== "draft") {
      throw new HttpError(409, "Only draft invoices can be deleted");
    }

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

  static async enqueueReminder(
    userId: string,
    invoiceId: string
  ): Promise<{ jobId: string }> {
    const invoice = await InvoicesService.getInvoice(userId, invoiceId);

    const status = normalizeStatus(invoice.status);
    if (status !== "sent" && status !== "overdue") {
      throw new HttpError(409, "Invoice cannot be reminded in its current state");
    }

    const clientEmail = String(invoice.client_email ?? "").trim();
    if (!clientEmail) {
      throw new HttpError(400, "Client email required for reminder");
    }

    const amountCents = toCentsFallback(invoice);
    if (amountCents <= 0) {
      throw new HttpError(400, "Invoice amount must be > 0");
    }

    const jobId = `invoice_reminder:manual:${invoice.id}`;

    try {
      await reminderQueue.add(
        "invoice_reminder",
        {
          invoiceId: invoice.id,
          userId,
        },
        {
          jobId,
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const duplicateJob =
        message.toLowerCase().includes("job") &&
        message.toLowerCase().includes("exists");

      if (!duplicateJob) {
        logger.error("InvoicesService.enqueueReminder failed", {
          userId,
          invoiceId,
          message,
        });
        throw new HttpError(500, "Failed to enqueue invoice reminder");
      }
    }

    return { jobId };
  }

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