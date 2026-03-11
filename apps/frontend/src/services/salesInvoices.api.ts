// apps/frontend/src/services/salesInvoices.api.ts

import { fetchWithAuth } from "../auth/fetchWithAuth";

export type SalesInvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "cancelled";

export type SalesInvoiceSourceSystem =
  | "artisanpro"
  | "pennylane"
  | "odoo"
  | "file_import"
  | "manual";

export type SalesInvoiceOriginType =
  | "manual"
  | "artisanpro"
  | "compta_import"
  | "sync";

export type SalesInvoice = {
  id: string;
  user_id: string;
  contact_id: string | null;
  project_id?: string | null;
  invoice_number: string | null;
  issue_date?: string | null;
  due_date: string | null;
  total_amount_cents: number | null;
  currency: string | null;
  status: SalesInvoiceStatus | string | null;
  source_system: SalesInvoiceSourceSystem | string | null;
  source_external_id: string | null;
  origin_type: SalesInvoiceOriginType | string | null;
  created_at?: string;
  updated_at?: string;
};

export type CreateSalesInvoiceInput = {
  contact_id?: string | null;
  project_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount_cents?: number | null;
  currency?: string | null;
  status?: SalesInvoiceStatus;
  source_system?: SalesInvoiceSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: SalesInvoiceOriginType;
};

export type UpdateSalesInvoiceInput = {
  contact_id?: string | null;
  project_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  total_amount_cents?: number | null;
  currency?: string | null;
  status?: SalesInvoiceStatus;
  source_system?: SalesInvoiceSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: SalesInvoiceOriginType;
};

type SalesInvoicesListResponse = {
  success: boolean;
  data: SalesInvoice[];
};

type SalesInvoiceItemResponse = {
  success: boolean;
  data: SalesInvoice;
};

const API = {
  salesInvoices: "/sales-invoices",
  salesInvoiceById: (id: string) =>
    `/sales-invoices/${encodeURIComponent(id)}`,
};

export async function listSalesInvoices(): Promise<SalesInvoice[]> {
  const data = await fetchWithAuth<SalesInvoicesListResponse>(
    API.salesInvoices,
    {
      method: "GET",
    }
  );

  if (data && Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

export async function getSalesInvoice(id: string): Promise<SalesInvoice> {
  const data = await fetchWithAuth<SalesInvoiceItemResponse>(
    API.salesInvoiceById(id),
    {
      method: "GET",
    }
  );

  return data.data;
}

export async function createSalesInvoice(
  input: CreateSalesInvoiceInput
): Promise<SalesInvoice> {
  const data = await fetchWithAuth<SalesInvoiceItemResponse>(
    API.salesInvoices,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  return data.data;
}

export async function updateSalesInvoice(
  id: string,
  input: UpdateSalesInvoiceInput
): Promise<SalesInvoice> {
  const data = await fetchWithAuth<SalesInvoiceItemResponse>(
    API.salesInvoiceById(id),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  return data.data;
}