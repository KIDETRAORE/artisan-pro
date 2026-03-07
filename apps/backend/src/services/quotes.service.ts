// apps/backend/src/services/quotes.service.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { InvoicesService, type InvoiceRow } from "./invoices.service";

export type Quote = {
  id: string;
  user_id: string;
  client_name: string | null;
  title: string | null;
  status: string;
  total_amount_cents: number;
  currency: string;
  created_at: string;
  updated_at?: string | null;
  invoice_id?: string | null;
};

export async function listQuotes(userId: string): Promise<Quote[]> {
  const { data, error } = await supabaseAdmin
    .from("quotes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Quote[];
}

export async function listPendingQuotes(userId: string): Promise<Quote[]> {
  const { data, error } = await supabaseAdmin
    .from("quotes")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "sent", "open", "accepted"])
    .is("invoice_id", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Quote[];
}

export async function createQuote(
  userId: string,
  payload: {
    client_name?: string;
    title?: string;
    total_amount_cents?: number;
  }
): Promise<Quote> {
  const { data, error } = await supabaseAdmin
    .from("quotes")
    .insert({
      user_id: userId,
      client_name: payload.client_name ?? null,
      title: payload.title ?? null,
      total_amount_cents: payload.total_amount_cents ?? 0,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Quote;
}

export async function updateQuoteStatus(
  userId: string,
  id: string,
  status: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("quotes")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function convertQuoteToInvoice(
  userId: string,
  quoteId: string
): Promise<{ quote: Quote; invoice: InvoiceRow }> {
  const { data: quote, error } = await supabaseAdmin
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load quote");
  }

  if (!quote) {
    throw new HttpError(404, "Quote not found");
  }

  const typedQuote = quote as Quote;

  if (typedQuote.invoice_id) {
    throw new HttpError(409, "Quote already converted");
  }

  const normalizedStatus = String(typedQuote.status ?? "").trim().toLowerCase();
  if (normalizedStatus !== "accepted") {
    throw new HttpError(409, "Only accepted quotes can be converted");
  }

  const totalAmountCents =
    typeof typedQuote.total_amount_cents === "number" &&
    Number.isFinite(typedQuote.total_amount_cents)
      ? typedQuote.total_amount_cents
      : 0;

  const invoice = await InvoicesService.createInvoice(userId, {
    client_name: typedQuote.client_name ?? "Client",
    client_email: null,
    total_amount: totalAmountCents / 100,
    due_date: new Date().toISOString(),
    status: "draft",
  });

  const { data: updatedQuote, error: updateError } = await supabaseAdmin
    .from("quotes")
    .update({
      invoice_id: invoice.id,
    })
    .eq("id", typedQuote.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError) {
    throw new HttpError(500, "Invoice created but quote update failed");
  }

  return {
    quote: updatedQuote as Quote,
    invoice,
  };
}