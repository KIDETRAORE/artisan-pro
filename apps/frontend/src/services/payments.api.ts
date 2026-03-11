// apps/frontend/src/services/payments.api.ts

import { fetchWithAuth } from "../auth/fetchWithAuth";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type PaymentDirection =
  | "inbound"
  | "outbound";

export type PaymentSourceSystem =
  | "artisanpro"
  | "pennylane"
  | "odoo"
  | "file_import"
  | "manual";

export type PaymentOriginType =
  | "manual"
  | "artisanpro"
  | "compta_import"
  | "sync";

export type Payment = {
  id: string;
  user_id: string;
  contact_id: string | null;
  project_id?: string | null;
  sales_invoice_id?: string | null;
  purchase_bill_id?: string | null;
  amount_cents: number | null;
  currency: string | null;
  payment_date: string | null;
  status: PaymentStatus | string | null;
  direction: PaymentDirection | string | null;
  reference?: string | null;
  source_system: PaymentSourceSystem | string | null;
  source_external_id: string | null;
  origin_type: PaymentOriginType | string | null;
  created_at?: string;
  updated_at?: string;
};

export type CreatePaymentInput = {
  contact_id?: string | null;
  project_id?: string | null;
  sales_invoice_id?: string | null;
  purchase_bill_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  payment_date?: string | null;
  status?: PaymentStatus;
  direction: PaymentDirection;
  reference?: string | null;
  source_system?: PaymentSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: PaymentOriginType;
};

export type UpdatePaymentInput = {
  contact_id?: string | null;
  project_id?: string | null;
  sales_invoice_id?: string | null;
  purchase_bill_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  payment_date?: string | null;
  status?: PaymentStatus;
  direction?: PaymentDirection;
  reference?: string | null;
  source_system?: PaymentSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: PaymentOriginType;
};

type PaymentsListResponse = {
  success: boolean;
  data: Payment[];
};

type PaymentItemResponse = {
  success: boolean;
  data: Payment;
};

const API = {
  payments: "/payments",
  paymentById: (id: string) => `/payments/${encodeURIComponent(id)}`,
};

export async function listPayments(): Promise<Payment[]> {
  const data = await fetchWithAuth<PaymentsListResponse>(API.payments, {
    method: "GET",
  });

  if (data && Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function getPayment(id: string): Promise<Payment> {
  const data = await fetchWithAuth<PaymentItemResponse>(API.paymentById(id), {
    method: "GET",
  });

  return data.data;
}

export async function createPayment(
  input: CreatePaymentInput
): Promise<Payment> {
  const data = await fetchWithAuth<PaymentItemResponse>(API.payments, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return data.data;
}

export async function updatePayment(
  id: string,
  input: UpdatePaymentInput
): Promise<Payment> {
  const data = await fetchWithAuth<PaymentItemResponse>(API.paymentById(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return data.data;
}