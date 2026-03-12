// apps/frontend/src/services/salesInvoices.api.ts

import { fetchWithAuth } from "../auth/fetchWithAuth";

export type SalesInvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "overdue"
  | "canceled";

export type SalesInvoiceSourceSystem =
  | "artisanpro"
  | "pennylane"
  | "odoo"
  | "file_import"
  | "manual";

export type SalesInvoiceOriginType =
  | "manual"
  | "quote"
  | "compta_import";

export type SalesInvoice = {
  id: string;
  user_id: string;
  contact_id: string | null;
  project_id?: string | null;
  invoice_number: string | null;
  issue_date?: string | null;
  due_date: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  currency: string | null;
  status: SalesInvoiceStatus | string | null;
  source_system: SalesInvoiceSourceSystem | string | null;
  source_external_id: string | null;
  origin_type: SalesInvoiceOriginType | string | null;
  reminder_count?: number | null;
  last_reminder_at?: string | null;
  stripe_checkout_id?: string | null;
  paid_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  type?: "sale" | "purchase" | string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  line_total_cents: number;
  line_total?: number | null;
  project_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CreateSalesInvoiceInput = {
  contact_id?: string | null;
  project_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  currency?: string | null;
  status?: SalesInvoiceStatus;
  source_system?: SalesInvoiceSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: SalesInvoiceOriginType;
  reminder_count?: number | null;
  last_reminder_at?: string | null;
  stripe_checkout_id?: string | null;
  paid_at?: string | null;
};

export type UpdateSalesInvoiceInput = {
  contact_id?: string | null;
  project_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  subtotal_cents?: number | null;
  tax_cents?: number | null;
  total_cents?: number | null;
  currency?: string | null;
  status?: SalesInvoiceStatus;
  source_system?: SalesInvoiceSourceSystem | null;
  source_external_id?: string | null;
  origin_type?: SalesInvoiceOriginType;
  reminder_count?: number | null;
  last_reminder_at?: string | null;
  stripe_checkout_id?: string | null;
  paid_at?: string | null;
};

export type CreateInvoiceLineInput = {
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
};

export type UpdateInvoiceLineInput = {
  description?: string;
  quantity?: number;
  unit_price_cents?: number;
  tax_rate?: number;
};

type SalesInvoicesListResponse = {
  success: boolean;
  data: SalesInvoice[];
};

type SalesInvoiceItemResponse = {
  success: boolean;
  data: SalesInvoice;
};

type InvoiceLinesListResponse = {
  success: boolean;
  lines: InvoiceLine[];
};

type InvoiceLineItemResponse = {
  success: boolean;
  line: InvoiceLine;
};

const API = {
  salesInvoices: "/sales-invoices",
  salesInvoiceById: (id: string) =>
    `/sales-invoices/${encodeURIComponent(id)}`,
  invoiceLines: "/invoice-lines",
  invoiceLineById: (id: string) => `/invoice-lines/${encodeURIComponent(id)}`,
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

export async function listInvoiceLines(
  invoiceId: string
): Promise<InvoiceLine[]> {
  const query = new URLSearchParams({ invoiceId }).toString();

  const data = await fetchWithAuth<InvoiceLinesListResponse>(
    `${API.invoiceLines}?${query}`,
    {
      method: "GET",
    }
  );

  if (data && Array.isArray(data.lines)) {
    return data.lines;
  }

  return [];
}

export async function createInvoiceLine(
  input: CreateInvoiceLineInput
): Promise<InvoiceLine> {
  const data = await fetchWithAuth<InvoiceLineItemResponse>(API.invoiceLines, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  return data.line;
}

export async function patchInvoiceLine(
  id: string,
  input: UpdateInvoiceLineInput
): Promise<InvoiceLine> {
  const data = await fetchWithAuth<InvoiceLineItemResponse>(
    API.invoiceLineById(id),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  return data.line;
}

export async function deleteInvoiceLine(id: string): Promise<void> {
  await fetchWithAuth<{ success: boolean }>(API.invoiceLineById(id), {
    method: "DELETE",
  });
}