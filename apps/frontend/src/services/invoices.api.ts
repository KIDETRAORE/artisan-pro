// apps/frontend/src/services/invoices.api.ts
import { fetchWithAuth } from "../auth/fetchWithAuth";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "canceled";

export type InvoiceOriginType = "manual" | "quote" | "compta_import";

export type Invoice = {
  id: string;
  user_id?: string;
  client_name: string;
  client_email: string | null;
  due_date: string;
  status: InvoiceStatus | string;
  project_id?: string | null;
  total_amount_cents?: number | null;
  total_amount?: number | null;
  subtotal_cents?: number | null;
  tax_amount_cents?: number | null;
  created_at?: string;
  invoice_number?: string | null;
  origin_type?: InvoiceOriginType | string | null;
  source_system?: string | null;
  source_external_id?: string | null;
  reminder_count?: number | null;
  last_reminder_at?: string | null;
  paid_at?: string | null;
  issue_date?: string | null;
  stripe_checkout_id?: string | null;
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

export type PayInvoiceResponse = {
  checkoutUrl: string;
  sessionId?: string;
};

type SuccessEnvelope = {
  success?: boolean;
  ok?: boolean;
};

type ListInvoicesResponse = SuccessEnvelope & {
  invoices?: Invoice[];
};

type InvoiceResponse = SuccessEnvelope & {
  invoice?: Invoice;
};

type ListInvoiceLinesResponse = SuccessEnvelope & {
  lines?: InvoiceLine[];
};

type CreateInvoiceLineResponse = SuccessEnvelope & {
  line?: InvoiceLine;
};

type PatchInvoiceLineResponse = SuccessEnvelope & {
  line?: InvoiceLine;
};

type DeleteInvoiceLineResponse = SuccessEnvelope;

type DeleteInvoiceResponse = SuccessEnvelope;

type SendInvoiceReminderResponse = SuccessEnvelope & {
  invoiceId?: string;
  jobId?: string | null;
};

type FinalizeInvoiceResponse = SuccessEnvelope & {
  invoice?: Invoice;
};

type PayInvoiceEnvelope = SuccessEnvelope & {
  checkoutUrl?: string;
  sessionId?: string;
};

export type InvoiceSoftDuplicateParams = {
  client_name: string;
  due_date: string;
  total_amount_cents?: number | null;
};

export type InvoiceSoftDuplicateMatch = {
  invoice: Invoice;
  reasons: Array<"client" | "date" | "amount">;
};

const API = {
  invoices: "/invoices",
  invoiceById: (id: string) => `/invoices/${encodeURIComponent(id)}`,
  finalize: (id: string) => `/invoices/${encodeURIComponent(id)}/finalize`,
  pay: (id: string) => `/invoices/${encodeURIComponent(id)}/pay`,
  remind: (id: string) => `/invoices/${encodeURIComponent(id)}/remind`,
  invoiceLines: "/invoice-lines",
  invoiceLinesByInvoice: (invoiceId: string) =>
    `/invoice-lines?invoiceId=${encodeURIComponent(invoiceId)}`,
  invoiceLineById: (id: string) => `/invoice-lines/${encodeURIComponent(id)}`,
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeIsoDate(value: string | null | undefined): string {
  return String(value ?? "").slice(0, 10);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapInvoice(data: unknown): Invoice {
  if (isObject(data) && "invoice" in data && data.invoice) {
    return data.invoice as Invoice;
  }

  return data as Invoice;
}

function unwrapLine(data: unknown): InvoiceLine {
  if (isObject(data) && "line" in data && data.line) {
    return data.line as InvoiceLine;
  }

  return data as InvoiceLine;
}

export function moneyCentsFromInvoice(inv: Invoice): number {
  if (typeof inv.total_amount_cents === "number") {
    return inv.total_amount_cents;
  }

  if (typeof inv.total_amount === "number") {
    return Math.round(inv.total_amount * 100);
  }

  return 0;
}

export async function listInvoices(): Promise<Invoice[]> {
  const data = await fetchWithAuth<ListInvoicesResponse | Invoice[]>(
    API.invoices,
    { method: "GET" }
  );

  if (Array.isArray(data)) {
    return data as Invoice[];
  }

  if (isObject(data) && Array.isArray(data.invoices)) {
    return data.invoices as Invoice[];
  }

  return [];
}

export async function getInvoice(id: string): Promise<Invoice> {
  const data = await fetchWithAuth<InvoiceResponse | Invoice>(API.invoiceById(id), {
    method: "GET",
  });

  return unwrapInvoice(data);
}

export async function createInvoiceDraft(params: {
  client_name: string;
  client_email?: string | null;
  due_date: string;
  project_id?: string | null;
  invoice_number?: string | null;
  origin_type?: InvoiceOriginType;
  source_system?: string | null;
  source_external_id?: string | null;
}): Promise<Invoice> {
  const data = await fetchWithAuth<InvoiceResponse | Invoice>(API.invoices, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: params.client_name,
      client_email: params.client_email ?? null,
      due_date: params.due_date,
      project_id: params.project_id ?? null,
      status: "draft",
      total_amount: 0,
      total_amount_cents: 0,
      invoice_number: params.invoice_number ?? null,
      origin_type: params.origin_type ?? "manual",
      source_system: params.source_system ?? "artisanpro",
      source_external_id: params.source_external_id ?? null,
    }),
  });

  return unwrapInvoice(data);
}

export async function patchInvoice(
  id: string,
  patch: Partial<
    Pick<
      Invoice,
      | "client_name"
      | "client_email"
      | "due_date"
      | "status"
      | "project_id"
      | "invoice_number"
      | "origin_type"
      | "source_system"
      | "source_external_id"
    >
  > & {
    total_amount?: number;
    total_amount_cents?: number;
  }
): Promise<Invoice> {
  const data = await fetchWithAuth<InvoiceResponse | Invoice>(API.invoiceById(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  return unwrapInvoice(data);
}

export async function finalizeInvoice(
  id: string
): Promise<{ success: boolean; invoice: Invoice }> {
  const data = await fetchWithAuth<FinalizeInvoiceResponse>(API.finalize(id), {
    method: "POST",
  });

  return {
    success: true,
    invoice: unwrapInvoice(data),
  };
}

export async function payInvoice(id: string): Promise<PayInvoiceResponse> {
  const data = await fetchWithAuth<PayInvoiceEnvelope>(API.pay(id), {
    method: "POST",
  });

  return {
    checkoutUrl: String(data.checkoutUrl ?? ""),
    sessionId: data.sessionId,
  };
}

export async function sendInvoiceReminder(
  id: string
): Promise<SendInvoiceReminderResponse> {
  const data = await fetchWithAuth<SendInvoiceReminderResponse>(API.remind(id), {
    method: "POST",
  });

  return {
    success: true,
    invoiceId: data.invoiceId,
    jobId: data.jobId ?? null,
  };
}

export async function deleteInvoice(
  id: string
): Promise<DeleteInvoiceResponse> {
  return await fetchWithAuth<DeleteInvoiceResponse>(API.invoiceById(id), {
    method: "DELETE",
  });
}

export async function findPotentialInvoiceDuplicates(
  params: InvoiceSoftDuplicateParams
): Promise<InvoiceSoftDuplicateMatch[]> {
  const invoices = await listInvoices();

  const client = normalizeText(params.client_name);
  const dueDate = normalizeIsoDate(params.due_date);
  const amount = Number(params.total_amount_cents ?? 0);

  return invoices
    .map((invoice) => {
      const reasons: Array<"client" | "date" | "amount"> = [];

      if (normalizeText(invoice.client_name) === client) {
        reasons.push("client");
      }

      if (normalizeIsoDate(invoice.due_date) === dueDate) {
        reasons.push("date");
      }

      if (
        typeof params.total_amount_cents === "number" &&
        moneyCentsFromInvoice(invoice) === amount
      ) {
        reasons.push("amount");
      }

      return {
        invoice,
        reasons,
      };
    })
    .filter((match) => match.reasons.length >= 2);
}

export async function listInvoiceLines(
  invoiceId: string
): Promise<InvoiceLine[]> {
  const data = await fetchWithAuth<ListInvoiceLinesResponse>(
    API.invoiceLinesByInvoice(invoiceId),
    {
      method: "GET",
    }
  );

  return data.lines ?? [];
}

export async function createInvoiceLine(input: {
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
}): Promise<InvoiceLine> {
  const qty = Number.isFinite(input.quantity) ? input.quantity : 1;
  const unit = Number.isFinite(input.unit_price_cents)
    ? input.unit_price_cents
    : 0;

  const data = await fetchWithAuth<CreateInvoiceLineResponse | InvoiceLine>(
    API.invoiceLines,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: input.invoice_id,
        description: input.description,
        quantity: qty,
        unit_price_cents: unit,
        tax_rate: input.tax_rate,
      }),
    }
  );

  return unwrapLine(data);
}

export async function patchInvoiceLine(
  id: string,
  patch: Partial<
    Pick<
      InvoiceLine,
      "description" | "quantity" | "unit_price_cents" | "tax_rate"
    >
  >
): Promise<InvoiceLine> {
  const data = await fetchWithAuth<PatchInvoiceLineResponse | InvoiceLine>(
    API.invoiceLineById(id),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );

  return unwrapLine(data);
}

export async function deleteInvoiceLine(
  id: string
): Promise<DeleteInvoiceLineResponse> {
  return await fetchWithAuth<DeleteInvoiceLineResponse>(API.invoiceLineById(id), {
    method: "DELETE",
  });
}