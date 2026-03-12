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
import { ContactsService } from "./contacts.service";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";
export type InvoiceOriginType = "manual" | "quote" | "compta_import";

export type InvoiceRow = {
  id: string;
  user_id: string;
  client_name: string;
  client_email: string | null;
  contact_id?: string | null;
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

type CanonicalInvoiceDbRow = {
  id: string;
  user_id: string;
  contact_id: string | null;
  project_id: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  currency: string | null;
  status: string | null;
  source_system: string | null;
  source_external_id: string | null;
  origin_type: string | null;
  created_at: string;
  updated_at?: string | null;
  reminder_count: number | null;
  last_reminder_at: string | null;
  stripe_checkout_id: string | null;
  paid_at: string | null;
};

type ContactSnapshot = {
  id: string;
  name: string;
  email: string | null;
};

const CreateInvoiceSchema = z.object({
  client_name: z.string().min(1),
  client_email: z.string().email().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
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
  contact_id: z.string().uuid().optional().nullable(),
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

const CanonicalInvoiceDbRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  invoice_number: z.string().nullable(),
  issue_date: z.string().nullable(),
  due_date: z.string().nullable(),
  subtotal_cents: z.number().int().nullable(),
  tax_cents: z.number().int().nullable(),
  total_cents: z.number().int().nullable(),
  currency: z.string().nullable(),
  status: z.string().nullable(),
  source_system: z.string().nullable(),
  source_external_id: z.string().nullable(),
  origin_type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
  reminder_count: z.number().int().nullable(),
  last_reminder_at: z.string().nullable(),
  stripe_checkout_id: z.string().nullable(),
  paid_at: z.string().nullable(),
});

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {});

function normalizeStatus(value: unknown): string {
  return String(value ?? "").toLowerCase().trim();
}

function normalizeLegacyStatusToCanonical(
  status: InvoiceStatus | string | null | undefined
): "draft" | "sent" | "paid" | "overdue" | "canceled" {
  const normalized = normalizeStatus(status);

  if (
    normalized === "draft" ||
    normalized === "sent" ||
    normalized === "paid" ||
    normalized === "overdue" ||
    normalized === "canceled"
  ) {
    return normalized;
  }

  if (normalized === "cancelled") {
    return "canceled";
  }

  return "sent";
}

function normalizeCanonicalStatusToLegacy(
  status: string | null | undefined
): string {
  const normalized = normalizeStatus(status);

  if (normalized === "cancelled") {
    return "canceled";
  }

  return normalized || "draft";
}

function toCentsFromEuro(amount: number): number {
  return Math.round(amount * 100);
}

function toEuroFromCents(amountCents: number | null | undefined): number {
  if (typeof amountCents !== "number" || !Number.isFinite(amountCents)) {
    return 0;
  }

  return amountCents / 100;
}

function toCentsFallback(invoice: InvoiceRow): number {
  const cents = invoice.total_amount_cents;
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return Math.round(cents);
  }

  const eur = invoice.total_amount;
  if (typeof eur === "number" && Number.isFinite(eur)) {
    return Math.round(eur * 100);
  }

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
    internalId: params.invoiceId,
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
    const allowedFields = new Set([
      "client_email",
      "contact_id",
      "due_date",
      "project_id",
    ]);
    const patchKeys = Object.keys(patch);

    const hasForbiddenField = patchKeys.some((key) => !allowedFields.has(key));
    if (hasForbiddenField) {
      throw new HttpError(
        409,
        "Only client_email, contact_id, due_date and project_id can be edited once invoice is sent"
      );
    }
  }
}

async function getContactsMap(
  userId: string,
  contactIds: Array<string | null | undefined>
): Promise<Map<string, ContactSnapshot>> {
  const ids = Array.from(
    new Set(
      contactIds.filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    )
  );

  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email")
    .eq("user_id", userId)
    .in("id", ids);

  if (error) {
    logger.warn("InvoicesService.getContactsMap failed", {
      userId,
      message: error.message,
    });
    return new Map();
  }

  const map = new Map<string, ContactSnapshot>();

  for (const row of (data ?? []) as Array<{
    id?: unknown;
    name?: unknown;
    email?: unknown;
  }>) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;

    map.set(id, {
      id,
      name: String(row.name ?? "").trim() || "Client",
      email: typeof row.email === "string" ? row.email : null,
    });
  }

  return map;
}

function mapCanonicalInvoiceToLegacy(
  row: CanonicalInvoiceDbRow,
  contact: ContactSnapshot | null
): InvoiceRow {
  return {
    id: row.id,
    user_id: row.user_id,
    client_name: contact?.name ?? "Client",
    client_email: contact?.email ?? null,
    contact_id: row.contact_id,
    total_amount: toEuroFromCents(row.total_cents),
    status: normalizeCanonicalStatusToLegacy(row.status),
    due_date: row.due_date ?? "",
    last_reminder_at: row.last_reminder_at,
    reminder_count: row.reminder_count ?? 0,
    created_at: row.created_at,
    project_id: row.project_id,
    invoice_number: row.invoice_number,
    origin_type: (row.origin_type as InvoiceOriginType | string | null) ?? null,
    source_system: row.source_system,
    source_external_id: row.source_external_id,
    total_amount_cents: row.total_cents,
    subtotal_cents: row.subtotal_cents,
    tax_amount_cents: row.tax_cents,
    issue_date: row.issue_date,
    stripe_checkout_id: row.stripe_checkout_id,
    paid_at: row.paid_at,
  };
}

async function getCanonicalInvoice(
  userId: string,
  invoiceId: string
): Promise<CanonicalInvoiceDbRow | null> {
  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
    .select(
      [
        "id",
        "user_id",
        "contact_id",
        "project_id",
        "invoice_number",
        "issue_date",
        "due_date",
        "subtotal_cents",
        "tax_cents",
        "total_cents",
        "currency",
        "status",
        "source_system",
        "source_external_id",
        "origin_type",
        "created_at",
        "updated_at",
        "reminder_count",
        "last_reminder_at",
        "stripe_checkout_id",
        "paid_at",
      ].join(", ")
    )
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    logger.error("InvoicesService.getCanonicalInvoice failed", {
      userId,
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to load invoice");
  }

  if (!data) {
    return null;
  }

  return CanonicalInvoiceDbRowSchema.parse(data);
}

async function listCanonicalInvoices(
  userId: string
): Promise<CanonicalInvoiceDbRow[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
    .select(
      [
        "id",
        "user_id",
        "contact_id",
        "project_id",
        "invoice_number",
        "issue_date",
        "due_date",
        "subtotal_cents",
        "tax_cents",
        "total_cents",
        "currency",
        "status",
        "source_system",
        "source_external_id",
        "origin_type",
        "created_at",
        "updated_at",
        "reminder_count",
        "last_reminder_at",
        "stripe_checkout_id",
        "paid_at",
      ].join(", ")
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("InvoicesService.listCanonicalInvoices failed", {
      userId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to list invoices");
  }

  return CanonicalInvoiceDbRowSchema.array().parse(data ?? []);
}

async function hydrateLegacyInvoice(
  userId: string,
  row: CanonicalInvoiceDbRow
): Promise<InvoiceRow> {
  const contactsMap = await getContactsMap(userId, [row.contact_id]);
  const contact =
    row.contact_id && contactsMap.has(row.contact_id)
      ? contactsMap.get(row.contact_id) ?? null
      : null;

  return mapCanonicalInvoiceToLegacy(row, contact);
}

async function hydrateLegacyInvoices(
  userId: string,
  rows: CanonicalInvoiceDbRow[]
): Promise<InvoiceRow[]> {
  const contactsMap = await getContactsMap(
    userId,
    rows.map((row) => row.contact_id)
  );

  return rows.map((row) =>
    mapCanonicalInvoiceToLegacy(
      row,
      row.contact_id ? contactsMap.get(row.contact_id) ?? null : null
    )
  );
}

async function resolveContactIdForInvoice(params: {
  userId: string;
  contactId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  sourceSystem?: string | null;
  sourceExternalId?: string | null;
}): Promise<string | null> {
  if (params.contactId !== undefined) {
    return params.contactId ?? null;
  }

  const clientName = String(params.clientName ?? "").trim();
  const clientEmail = params.clientEmail ?? null;

  if (!clientName) {
    return null;
  }

  const contact = await ContactsService.findOrCreateContact({
    userId: params.userId,
    sourceSystem: toAccountingSource({
      originType: "manual",
      sourceSystem: params.sourceSystem ?? "artisanpro",
    }),
    input: {
      name: clientName,
      contact_type: "client",
      email: clientEmail,
      source_system: params.sourceSystem ?? "artisanpro",
      source_external_id: params.sourceExternalId ?? null,
    },
  });

  return contact.id;
}

async function invoiceHasLines(invoiceId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("type", "sale")
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

async function recomputeSalesInvoiceTotals(
  invoiceId: string
): Promise<{ subtotalCents: number; taxCents: number; totalCents: number }> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("line_total_cents, line_total, tax_rate")
    .eq("invoice_id", invoiceId)
    .eq("type", "sale");

  if (error) {
    logger.error("InvoicesService.recomputeSalesInvoiceTotals failed", {
      invoiceId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to recompute invoice totals");
  }

  const { subtotalCents, taxCents } = ((data ?? []) as Array<{
    line_total_cents?: unknown;
    line_total?: unknown;
    tax_rate?: unknown;
  }>).reduce(
    (acc, row) => {
      const lineTotalCents =
        typeof row.line_total_cents === "number" &&
        Number.isFinite(row.line_total_cents)
          ? Math.round(row.line_total_cents)
          : typeof row.line_total === "number" && Number.isFinite(row.line_total)
            ? Math.round(row.line_total * 100)
            : 0;

      const taxRate =
        typeof row.tax_rate === "number" && Number.isFinite(row.tax_rate)
          ? row.tax_rate
          : 0;

      acc.subtotalCents += lineTotalCents;
      acc.taxCents += Math.round(lineTotalCents * (taxRate / 100));

      return acc;
    },
    { subtotalCents: 0, taxCents: 0 }
  );

  const totalCents = subtotalCents + taxCents;

  const { error: updateError } = await supabaseAdmin
    .from("sales_invoices")
    .update({
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
    })
    .eq("id", invoiceId);

  if (updateError) {
    logger.error("InvoicesService.recomputeSalesInvoiceTotals update failed", {
      invoiceId,
      message: updateError.message,
    });
    throw new HttpError(500, "Failed to recompute invoice totals");
  }

  return { subtotalCents, taxCents, totalCents };
}

async function generateInvoiceNumber(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("generate_invoice_number", {
    p_user_id: userId,
  });

  if (error) {
    logger.error("InvoicesService.generateInvoiceNumber failed", {
      userId,
      message: error.message,
    });
    throw new HttpError(500, "Failed to generate invoice number");
  }

  const nextInvoiceNumber = String(data ?? "").trim();
  if (!nextInvoiceNumber) {
    throw new HttpError(500, "Failed to generate invoice number");
  }

  return nextInvoiceNumber;
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

    const resolvedContactId = await resolveContactIdForInvoice({
      userId,
      contactId: payload.contact_id,
      clientName: payload.client_name,
      clientEmail: payload.client_email ?? null,
      sourceSystem: normalizedSourceSystem,
      sourceExternalId: payload.source_external_id ?? null,
    });

    const totalAmountCents = toCentsFromEuro(payload.total_amount);

    const match = await AccountingMatchingService.matchInvoiceCandidate(userId, {
      type: "sale",
      sourceSystem: toAccountingSource({
        originType: payload.origin_type,
        sourceSystem: normalizedSourceSystem,
      }),
      sourceExternalId: payload.source_external_id ?? null,
      invoiceNumber: payload.invoice_number ?? null,
      clientName: payload.client_name ?? null,
      issueDate: null,
      dueDate: payload.due_date ?? null,
      totalAmountCents,
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
      });

      return await InvoicesService.getInvoice(userId, match.matchedInvoiceId);
    }

    if (match.decision === "flag_conflict") {
      throw new HttpError(409, match.reason);
    }

    if (match.decision === "upgrade_source" && match.matchedInvoiceId) {
      const { error } = await supabaseAdmin
        .from("sales_invoices")
        .update({
          contact_id: resolvedContactId,
          project_id: payload.project_id ?? null,
          due_date: payload.due_date,
          subtotal_cents: totalAmountCents,
          tax_cents: 0,
          total_cents: totalAmountCents,
          status: normalizeLegacyStatusToCanonical(payload.status),
          invoice_number: payload.invoice_number ?? null,
          origin_type: payload.origin_type ?? "manual",
          source_system: normalizedSourceSystem,
          source_external_id: payload.source_external_id ?? null,
        })
        .eq("id", match.matchedInvoiceId)
        .eq("user_id", userId);

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
        invoiceId: match.matchedInvoiceId,
      });

      return await InvoicesService.getInvoice(userId, match.matchedInvoiceId);
    }

    const { data, error } = await supabaseAdmin
      .from("sales_invoices")
      .insert({
        user_id: userId,
        contact_id: resolvedContactId,
        project_id: payload.project_id ?? null,
        due_date: payload.due_date,
        subtotal_cents: totalAmountCents,
        tax_cents: 0,
        total_cents: totalAmountCents,
        currency: "EUR",
        status: normalizeLegacyStatusToCanonical(payload.status),
        invoice_number: payload.invoice_number ?? null,
        origin_type: payload.origin_type ?? "manual",
        source_system: normalizedSourceSystem,
        source_external_id: payload.source_external_id ?? null,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      logger.error("InvoicesService.createInvoice failed", {
        userId,
        message: error?.message ?? "Missing inserted id",
      });
      throw new HttpError(500, "Failed to create invoice");
    }

    await syncInvoiceExternalMapping({
      userId,
      sourceSystem: normalizedSourceSystem,
      sourceExternalId: payload.source_external_id,
      invoiceId: String(data.id),
    });

    return await InvoicesService.getInvoice(userId, String(data.id));
  }

  static async listInvoices(userId: string): Promise<InvoiceRow[]> {
    const rows = await listCanonicalInvoices(userId);
    return await hydrateLegacyInvoices(userId, rows);
  }

  static async getInvoice(userId: string, invoiceId: string): Promise<InvoiceRow> {
    const row = await getCanonicalInvoice(userId, invoiceId);

    if (!row) {
      throw new HttpError(404, "Invoice not found");
    }

    return await hydrateLegacyInvoice(userId, row);
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

    const normalizedSourceSystem =
      patch.source_system !== undefined || patch.origin_type !== undefined
        ? resolveSourceSystem({
            originType: patch.origin_type ?? before.origin_type,
            sourceSystem: patch.source_system ?? before.source_system,
          })
        : undefined;

    const resolvedContactId =
      patch.contact_id !== undefined ||
      patch.client_name !== undefined ||
      patch.client_email !== undefined
        ? await resolveContactIdForInvoice({
            userId,
            contactId: patch.contact_id,
            clientName: patch.client_name ?? before.client_name,
            clientEmail:
              patch.client_email !== undefined
                ? patch.client_email
                : before.client_email,
            sourceSystem:
              normalizedSourceSystem ?? before.source_system ?? "artisanpro",
            sourceExternalId:
              patch.source_external_id !== undefined
                ? patch.source_external_id
                : before.source_external_id,
          })
        : undefined;

    const updatePayload: Record<string, unknown> = {};

    if (patch.due_date !== undefined) {
      updatePayload.due_date = patch.due_date;
    }
    if (patch.project_id !== undefined) {
      updatePayload.project_id = patch.project_id ?? null;
    }
    if (patch.invoice_number !== undefined) {
      updatePayload.invoice_number = patch.invoice_number ?? null;
    }
    if (patch.origin_type !== undefined) {
      updatePayload.origin_type = patch.origin_type ?? null;
    }
    if (patch.source_system !== undefined || normalizedSourceSystem !== undefined) {
      updatePayload.source_system = normalizedSourceSystem ?? null;
    }
    if (patch.source_external_id !== undefined) {
      updatePayload.source_external_id = patch.source_external_id ?? null;
    }
    if (patch.status !== undefined) {
      updatePayload.status = normalizeLegacyStatusToCanonical(patch.status);
    }
    if (patch.total_amount !== undefined) {
      const nextTotalCents = toCentsFromEuro(patch.total_amount);
      updatePayload.subtotal_cents = nextTotalCents;
      updatePayload.tax_cents = 0;
      updatePayload.total_cents = nextTotalCents;
    }
    if (resolvedContactId !== undefined) {
      updatePayload.contact_id = resolvedContactId;
    }

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update(updatePayload)
      .eq("id", invoiceId)
      .eq("user_id", userId);

    if (error) {
      logger.error("InvoicesService.updateInvoice failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update invoice");
    }

    if (
      normalizedSourceSystem &&
      patch.source_external_id !== undefined &&
      patch.source_external_id
    ) {
      await syncInvoiceExternalMapping({
        userId,
        sourceSystem: normalizedSourceSystem,
        sourceExternalId: patch.source_external_id,
        invoiceId,
      });
    }

    const updated = await InvoicesService.getInvoice(userId, invoiceId);
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
      .from("sales_invoices")
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

    const totals = await recomputeSalesInvoiceTotals(invoiceId);

    let nextInvoiceNumber: string | null = null;
    if (invoice.invoice_number == null) {
      nextInvoiceNumber = await generateInvoiceNumber(userId);
    }

    const patch: Record<string, unknown> = {
      status: "sent",
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
    };

    if (invoice.issue_date == null) {
      patch.issue_date = new Date().toISOString();
    }

    if (nextInvoiceNumber) {
      patch.invoice_number = nextInvoiceNumber;
    }

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update(patch)
      .eq("id", invoiceId)
      .eq("user_id", userId);

    if (error) {
      logger.error("InvoicesService.finalizeInvoice update failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to finalize invoice");
    }

    await enqueuePennylanePush({ userId, invoiceId });

    return await InvoicesService.getInvoice(userId, invoiceId);
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

    const { error } = await supabaseAdmin
      .from("sales_invoices")
      .update({
        stripe_checkout_id: session.id,
      })
      .eq("id", invoice.id)
      .eq("user_id", userId);

    if (error) {
      logger.error("InvoicesService.createPaymentSession persist failed", {
        userId,
        invoiceId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to persist Stripe checkout session");
    }

    const url = session.url;
    if (!url) {
      throw new HttpError(502, "Stripe session url missing");
    }

    return { id: session.id, url };
  }
}