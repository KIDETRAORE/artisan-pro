// apps/frontend/src/api/quotes.api.ts
import { fetchWithAuth } from "../auth/fetchWithAuth";

const QUOTES_BASE_PATH = "/quotes";

export type QuoteStatus =
  | "draft"
  | "pending"
  | "sent"
  | "accepted"
  | "rejected"
  | "refused"
  | "expired"
  | "cancelled"
  | string;

export type Quote = {
  id: string;
  client_name: string;
  status: QuoteStatus;
  created_at: string;
  updated_at?: string | null;
  total_amount_cents: number | null;
  total_amount?: number | null;
  title?: string | null;
  reference?: string | null;
  invoice_id?: string | null;
};

export type ConvertedInvoice = {
  id: string;
  client_name: string;
  client_email?: string | null;
  total_amount: number;
  total_amount_cents?: number | null;
  status: string;
  due_date: string;
  created_at: string;
  invoice_number?: string | null;
  project_id?: string | null;
};

export type ConvertQuoteToInvoiceResponse = {
  success: boolean;
  quote: Quote;
  invoice: ConvertedInvoice;
};

type QuotesApiListResponse =
  | Quote[]
  | { quotes?: unknown[] }
  | { data?: unknown[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeQuote(value: unknown): Quote | null {
  if (!isObject(value)) return null;

  const id = asString(value.id);
  if (!id) return null;

  const clientName =
    asString(value.client_name) ??
    asString(value.clientName) ??
    asString(value.customer_name) ??
    asString(value.customerName) ??
    "Client";

  const status =
    asString(value.status) ??
    asString(value.quote_status) ??
    asString(value.quoteStatus) ??
    "draft";

  const createdAt =
    asString(value.created_at) ??
    asString(value.createdAt) ??
    new Date(0).toISOString();

  const updatedAt = asString(value.updated_at) ?? asString(value.updatedAt);

  const totalAmountCents =
    asNullableNumber(value.total_amount_cents) ??
    asNullableNumber(value.totalAmountCents);

  const totalAmount =
    asNullableNumber(value.total_amount) ??
    asNullableNumber(value.totalAmount);

  const title = asString(value.title);
  const reference =
    asString(value.reference) ??
    asString(value.quote_number) ??
    asString(value.quoteNumber);

  const invoiceId =
    asString(value.invoice_id) ?? asString(value.invoiceId);

  return {
    id,
    client_name: clientName,
    status,
    created_at: createdAt,
    updated_at: updatedAt,
    total_amount_cents: totalAmountCents,
    total_amount: totalAmount,
    title,
    reference,
    invoice_id: invoiceId,
  };
}

function extractQuotes(payload: QuotesApiListResponse): Quote[] {
  let rawList: unknown[] = [];

  if (Array.isArray(payload)) {
    rawList = payload;
  } else if ("quotes" in payload && Array.isArray(payload.quotes)) {
    rawList = payload.quotes;
  } else if ("data" in payload && Array.isArray(payload.data)) {
    rawList = payload.data;
  }

  return rawList
    .map(normalizeQuote)
    .filter((quote): quote is Quote => quote !== null);
}

function getSortDate(quote: Quote): string {
  return quote.updated_at || quote.created_at;
}

function compareByNewest(a: Quote, b: Quote): number {
  return getSortDate(b).localeCompare(getSortDate(a));
}

/**
 * Définition frontend de la liste exploitable dans DashboardQuotes :
 * - pending
 * - sent
 * - open
 * - accepted
 *
 * accepted reste visible pour permettre la conversion en facture.
 */
function isPendingQuoteStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === "pending" ||
    normalized === "sent" ||
    normalized === "open" ||
    normalized === "accepted"
  );
}

export async function listQuotes(): Promise<Quote[]> {
  const response = await fetchWithAuth<QuotesApiListResponse>(QUOTES_BASE_PATH, {
    method: "GET",
  });

  return extractQuotes(response).sort(compareByNewest);
}

export async function listPendingQuotes(): Promise<Quote[]> {
  const quotes = await listQuotes();

  return quotes
    .filter((quote) => isPendingQuoteStatus(String(quote.status)))
    .sort(compareByNewest);
}

export async function listRecentQuotes(limit = 5): Promise<Quote[]> {
  const quotes = await listQuotes();

  return quotes.sort(compareByNewest).slice(0, Math.max(0, limit));
}

export async function updateQuoteStatus(
  id: string,
  status: QuoteStatus
): Promise<void> {
  await fetchWithAuth(`${QUOTES_BASE_PATH}/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function convertQuoteToInvoice(
  id: string
): Promise<ConvertQuoteToInvoiceResponse> {
  return fetchWithAuth<ConvertQuoteToInvoiceResponse>(
    `${QUOTES_BASE_PATH}/${id}/convert`,
    {
      method: "POST",
    }
  );
}