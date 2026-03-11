// apps/backend/src/services/payments.service.ts

import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";

export const PaymentStatusSchema = z.enum([
  "pending",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentDirectionSchema = z.enum([
  "inbound",
  "outbound",
]);

export type PaymentDirection = z.infer<typeof PaymentDirectionSchema>;

export const PaymentSourceSystemSchema = z.enum([
  "artisanpro",
  "pennylane",
  "odoo",
  "file_import",
  "manual",
]);

export type PaymentSourceSystem = z.infer<typeof PaymentSourceSystemSchema>;

export const PaymentOriginTypeSchema = z.enum([
  "manual",
  "artisanpro",
  "compta_import",
  "sync",
]);

export type PaymentOriginType = z.infer<typeof PaymentOriginTypeSchema>;

export const PaymentRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable().optional(),
  sales_invoice_id: z.string().uuid().nullable().optional(),
  purchase_bill_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().nullable(),
  currency: z.string().nullable(),
  payment_date: z.string().nullable(),
  status: z.string().nullable(),
  direction: z.string().nullable(),
  reference: z.string().nullable().optional(),
  source_system: z.string().nullable(),
  source_external_id: z.string().nullable(),
  origin_type: z.string().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type PaymentRow = z.infer<typeof PaymentRowSchema>;

const CreatePaymentSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  sales_invoice_id: z.string().uuid().nullable().optional(),
  purchase_bill_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  payment_date: z.string().trim().min(1).nullable().optional(),
  status: PaymentStatusSchema.default("pending"),
  direction: PaymentDirectionSchema,
  reference: z.string().trim().min(1).nullable().optional(),
  source_system: PaymentSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: PaymentOriginTypeSchema.default("manual"),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

const UpdatePaymentSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  sales_invoice_id: z.string().uuid().nullable().optional(),
  purchase_bill_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  payment_date: z.string().trim().min(1).nullable().optional(),
  status: PaymentStatusSchema.optional(),
  direction: PaymentDirectionSchema.optional(),
  reference: z.string().trim().min(1).nullable().optional(),
  source_system: PaymentSourceSystemSchema.nullable().optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: PaymentOriginTypeSchema.optional(),
});

export type UpdatePaymentInput = z.infer<typeof UpdatePaymentSchema>;

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeCreateInput(input: CreatePaymentInput) {
  return {
    contact_id: input.contact_id ?? null,
    project_id: input.project_id ?? null,
    sales_invoice_id: input.sales_invoice_id ?? null,
    purchase_bill_id: input.purchase_bill_id ?? null,
    amount_cents: input.amount_cents ?? null,
    currency: normalizeNullableString(input.currency) ?? "EUR",
    payment_date: normalizeNullableString(input.payment_date),
    status: input.status,
    direction: input.direction,
    reference: normalizeNullableString(input.reference),
    source_system: input.source_system ?? null,
    source_external_id: normalizeNullableString(input.source_external_id),
    origin_type: input.origin_type,
  };
}

function sanitizeUpdateInput(input: UpdatePaymentInput) {
  const patch: Record<string, unknown> = {};

  if ("contact_id" in input) {
    patch.contact_id = input.contact_id ?? null;
  }

  if ("project_id" in input) {
    patch.project_id = input.project_id ?? null;
  }

  if ("sales_invoice_id" in input) {
    patch.sales_invoice_id = input.sales_invoice_id ?? null;
  }

  if ("purchase_bill_id" in input) {
    patch.purchase_bill_id = input.purchase_bill_id ?? null;
  }

  if ("amount_cents" in input) {
    patch.amount_cents = input.amount_cents ?? null;
  }

  if ("currency" in input) {
    patch.currency = normalizeNullableString(input.currency);
  }

  if ("payment_date" in input) {
    patch.payment_date = normalizeNullableString(input.payment_date);
  }

  if ("status" in input) {
    patch.status = input.status;
  }

  if ("direction" in input) {
    patch.direction = input.direction;
  }

  if ("reference" in input) {
    patch.reference = normalizeNullableString(input.reference);
  }

  if ("source_system" in input) {
    patch.source_system = input.source_system ?? null;
  }

  if ("source_external_id" in input) {
    patch.source_external_id = normalizeNullableString(input.source_external_id);
  }

  if ("origin_type" in input) {
    patch.origin_type = input.origin_type;
  }

  return patch;
}

async function readOneById(
  userId: string,
  id: string
): Promise<PaymentRow | null> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select(
      "id, user_id, contact_id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, currency, payment_date, status, direction, reference, source_system, source_external_id, origin_type, created_at, updated_at"
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to fetch payment");
  }

  if (!data) {
    return null;
  }

  return PaymentRowSchema.parse(data);
}

export class PaymentsService {
  static async listPayments(userId: string): Promise<PaymentRow[]> {
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(
        "id, user_id, contact_id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, currency, payment_date, status, direction, reference, source_system, source_external_id, origin_type, created_at, updated_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new HttpError(500, "Failed to list payments");
    }

    return PaymentRowSchema.array().parse(data ?? []);
  }

  static async getPayment(
    userId: string,
    paymentId: string
  ): Promise<PaymentRow> {
    const row = await readOneById(userId, paymentId);

    if (!row) {
      throw new HttpError(404, "Payment not found");
    }

    return row;
  }

  static async findBySourceExternalId(params: {
    userId: string;
    sourceSystem: PaymentSourceSystem;
    sourceExternalId: string;
  }): Promise<PaymentRow | null> {
    const sourceExternalId = normalizeNullableString(params.sourceExternalId);

    if (!sourceExternalId) {
      return null;
    }

    const { data, error } = await supabaseAdmin
      .from("payments")
      .select(
        "id, user_id, contact_id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, currency, payment_date, status, direction, reference, source_system, source_external_id, origin_type, created_at, updated_at"
      )
      .eq("user_id", params.userId)
      .eq("source_system", params.sourceSystem)
      .eq("source_external_id", sourceExternalId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "Failed to fetch payment by source");
    }

    if (!data) {
      return null;
    }

    return PaymentRowSchema.parse(data);
  }

  static async createPayment(
    userId: string,
    input: CreatePaymentInput
  ): Promise<PaymentRow> {
    const parsed = CreatePaymentSchema.parse(input);

    if (parsed.sales_invoice_id && parsed.purchase_bill_id) {
      throw new HttpError(
        400,
        "A payment cannot be linked to both a sales invoice and a purchase bill"
      );
    }

    const payload = sanitizeCreateInput(parsed);

    const { data, error } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: userId,
        ...payload,
      })
      .select(
        "id, user_id, contact_id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, currency, payment_date, status, direction, reference, source_system, source_external_id, origin_type, created_at, updated_at"
      )
      .single();

    if (error || !data) {
      throw new HttpError(500, "Failed to create payment");
    }

    return PaymentRowSchema.parse(data);
  }

  static async updatePayment(
    userId: string,
    paymentId: string,
    input: UpdatePaymentInput
  ): Promise<PaymentRow> {
    const parsed = UpdatePaymentSchema.parse(input);

    if (parsed.sales_invoice_id && parsed.purchase_bill_id) {
      throw new HttpError(
        400,
        "A payment cannot be linked to both a sales invoice and a purchase bill"
      );
    }

    const patch = sanitizeUpdateInput(parsed);

    if (Object.keys(patch).length === 0) {
      return await this.getPayment(userId, paymentId);
    }

    const { error } = await supabaseAdmin
      .from("payments")
      .update(patch)
      .eq("id", paymentId)
      .eq("user_id", userId);

    if (error) {
      throw new HttpError(500, "Failed to update payment");
    }

    return await this.getPayment(userId, paymentId);
  }
}