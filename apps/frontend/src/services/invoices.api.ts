// apps/frontend/src/services/invoices.api.ts
import { fetchWithAuth } from "../auth/fetchWithAuth";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";

export type Invoice = {
  id: string;
  user_id?: string;
  client_name: string;
  client_email: string | null;
  due_date: string;
  status: InvoiceStatus | string;
  total_amount_cents?: number | null;
  total_amount?: number | null;
  created_at?: string;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  line_total_cents: number;
  created_at?: string;
};

// ✅ AJOUT: réponse attendue du backend pour Stripe Checkout
export type PayInvoiceResponse = {
  checkoutUrl: string;
  sessionId?: string;
};

// ✅ Centralise les endpoints => facile à adapter si besoin
const API = {
  invoices: "/invoices",
  invoiceById: (id: string) => `/invoices/${encodeURIComponent(id)}`,
  finalize: (id: string) => `/invoices/${encodeURIComponent(id)}/finalize`,

  // ✅ AJOUT: payer une facture (Stripe Checkout)
  pay: (id: string) => `/invoices/${encodeURIComponent(id)}/pay`,

  // ✅ MODIF: aligné avec le backend (lines sous /invoices/:id/lines + patch/delete sur /invoice-lines/:id)
  invoiceLinesByInvoice: (invoiceId: string) =>
    `/invoices/${encodeURIComponent(invoiceId)}/lines`,
  invoiceLineById: (id: string) => `/invoice-lines/${encodeURIComponent(id)}`,
};

export function moneyCentsFromInvoice(inv: Invoice): number {
  if (typeof inv.total_amount_cents === "number") return inv.total_amount_cents;
  if (typeof inv.total_amount === "number") return Math.round(inv.total_amount * 100);
  return 0;
}

export async function listInvoices(): Promise<Invoice[]> {
  const data = await fetchWithAuth<unknown>(API.invoices, { method: "GET" });
  return (Array.isArray(data) ? (data as Invoice[]) : []) ?? [];
}

export async function getInvoice(id: string): Promise<Invoice> {
  return await fetchWithAuth<Invoice>(API.invoiceById(id), {
    method: "GET",
  });
}

export async function createInvoiceDraft(params: {
  client_name: string;
  client_email?: string | null;
  due_date: string;
}): Promise<Invoice> {
  return await fetchWithAuth<Invoice>(API.invoices, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: params.client_name,
      client_email: params.client_email ?? null,
      due_date: params.due_date,
      status: "draft",
      // ✅ MVP: compat (si backend attend encore total_amount) + cents si supporté
      total_amount: 0,
      total_amount_cents: 0,
    }),
  });
}

export async function patchInvoice(
  id: string,
  patch: Partial<Pick<Invoice, "client_name" | "client_email" | "due_date" | "status">> & {
    total_amount?: number;
    total_amount_cents?: number;
  }
): Promise<Invoice> {
  return await fetchWithAuth<Invoice>(API.invoiceById(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function finalizeInvoice(
  id: string
): Promise<{ ok: boolean; invoice: Invoice }> {
  return await fetchWithAuth<{ ok: boolean; invoice: Invoice }>(API.finalize(id), {
    method: "POST",
  });
}

// ✅ AJOUT: Stripe Checkout (POST /invoices/:id/pay)
export async function payInvoice(id: string): Promise<PayInvoiceResponse> {
  return await fetchWithAuth<PayInvoiceResponse>(API.pay(id), {
    method: "POST",
  });
}

/**
 * ===== Lines =====
 */
export async function listInvoiceLines(invoiceId: string): Promise<InvoiceLine[]> {
  const data = await fetchWithAuth<unknown>(API.invoiceLinesByInvoice(invoiceId), {
    method: "GET",
  });
  return (Array.isArray(data) ? (data as InvoiceLine[]) : []) ?? [];
}

export async function createInvoiceLine(input: {
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
}): Promise<InvoiceLine> {
  const qty = Number.isFinite(input.quantity) ? input.quantity : 1;
  const unit = Number.isFinite(input.unit_price_cents) ? input.unit_price_cents : 0;
  const lineTotal = Math.round(qty * unit);

  return await fetchWithAuth<InvoiceLine>(API.invoiceLinesByInvoice(input.invoice_id), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice_id: input.invoice_id,
      description: input.description,
      quantity: qty,
      unit_price_cents: unit,
      tax_rate: input.tax_rate,
      line_total_cents: lineTotal,
    }),
  });
}

export async function patchInvoiceLine(
  id: string,
  patch: Partial<Pick<InvoiceLine, "description" | "quantity" | "unit_price_cents" | "tax_rate">>
): Promise<InvoiceLine> {
  const qty = typeof patch.quantity === "number" ? patch.quantity : undefined;
  const unit = typeof patch.unit_price_cents === "number" ? patch.unit_price_cents : undefined;

  // si qty/unit changent, recalcul line_total_cents côté client (MVP)
  const line_total_cents =
    typeof qty === "number" && typeof unit === "number" ? Math.round(qty * unit) : undefined;

  return await fetchWithAuth<InvoiceLine>(API.invoiceLineById(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...patch,
      ...(typeof line_total_cents === "number" ? { line_total_cents } : {}),
    }),
  });
}

export async function deleteInvoiceLine(id: string): Promise<{ ok: boolean } | unknown> {
  return await fetchWithAuth<unknown>(API.invoiceLineById(id), {
    method: "DELETE",
  });
}