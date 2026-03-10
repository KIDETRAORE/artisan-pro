// apps/backend/src/services/accountingMatching.service.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";

export type AccountingSource =
  | "artisanpro"
  | "pennylane"
  | "odoo"
  | "file_import"
  | "manual";

export const SOURCE_PRIORITY: Record<AccountingSource, number> = {
  pennylane: 300,
  odoo: 300,
  file_import: 200,
  artisanpro: 100,
  manual: 100,
};

export type MatchConfidence =
  | "exact"
  | "high"
  | "probable"
  | "manual_required";

export type MatchDecision =
  | "link_existing"
  | "upgrade_source"
  | "ignore_lower_priority"
  | "create_new"
  | "flag_conflict";

export type InvoiceMatchCandidate = {
  sourceSystem: AccountingSource;
  sourceExternalId: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmountCents: number | null;
};

export type InvoiceMatchResult = {
  decision: MatchDecision;
  confidence: MatchConfidence;
  matchedInvoiceId: string | null;
  matchedBy:
    | "external_id_map"
    | "source_external_id"
    | "invoice_number"
    | "client_date_amount"
    | "none";
  reason: string;
};

type InvoiceLookupRow = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount_cents: number | null;
  source_system: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeReference(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    return raw.slice(0, 10);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function toPriority(sourceSystem: string | null | undefined): number {
  const key = String(sourceSystem ?? "").trim().toLowerCase() as AccountingSource;
  return SOURCE_PRIORITY[key] ?? 0;
}

function comparePriority(
  existingSourceSystem: string | null | undefined,
  incomingSourceSystem: AccountingSource
): MatchDecision {
  const existingPriority = toPriority(existingSourceSystem);
  const incomingPriority = toPriority(incomingSourceSystem);

  if (incomingPriority > existingPriority) {
    return "upgrade_source";
  }

  if (incomingPriority < existingPriority) {
    return "ignore_lower_priority";
  }

  return "link_existing";
}

async function findByExternalIdMap(
  userId: string,
  candidate: InvoiceMatchCandidate
): Promise<InvoiceMatchResult | null> {
  if (!candidate.sourceExternalId) return null;

  const { data, error } = await supabaseAdmin
    .from("external_id_map")
    .select("internal_id")
    .eq("provider", candidate.sourceSystem)
    .eq("object_type", "invoice")
    .eq("external_id", candidate.sourceExternalId)
    .maybeSingle();

  if (error || !data?.internal_id) {
    return null;
  }

  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("id, source_system")
    .eq("id", data.internal_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!invoice?.id) {
    return null;
  }

  return {
    decision: comparePriority(invoice.source_system, candidate.sourceSystem),
    confidence: "exact",
    matchedInvoiceId: invoice.id,
    matchedBy: "external_id_map",
    reason: "external_id_map match",
  };
}

async function findBySourceExternalId(
  userId: string,
  candidate: InvoiceMatchCandidate
): Promise<InvoiceMatchResult | null> {
  if (!candidate.sourceExternalId) return null;

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, source_system")
    .eq("user_id", userId)
    .eq("source_system", candidate.sourceSystem)
    .eq("source_external_id", candidate.sourceExternalId)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return {
    decision: comparePriority(data.source_system, candidate.sourceSystem),
    confidence: "exact",
    matchedInvoiceId: data.id,
    matchedBy: "source_external_id",
    reason: "source_system + source_external_id match",
  };
}

async function findByInvoiceNumber(
  userId: string,
  candidate: InvoiceMatchCandidate
): Promise<InvoiceMatchResult | null> {
  const normalizedRef = normalizeReference(candidate.invoiceNumber);
  if (!normalizedRef) return null;

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, source_system")
    .eq("user_id", userId)
    .not("invoice_number", "is", null);

  if (error || !Array.isArray(data)) {
    return null;
  }

  const matches = data.filter(
    (row) => normalizeReference(row.invoice_number) === normalizedRef
  );

  if (matches.length !== 1) {
    return matches.length > 1
      ? {
          decision: "flag_conflict",
          confidence: "manual_required",
          matchedInvoiceId: null,
          matchedBy: "invoice_number",
          reason: "multiple invoices match the same invoice_number",
        }
      : null;
  }

  const match = matches[0];
  if (!match) {
    return null;
  }

  return {
    decision: comparePriority(match.source_system, candidate.sourceSystem),
    confidence: "high",
    matchedInvoiceId: match.id,
    matchedBy: "invoice_number",
    reason: "invoice_number match",
  };
}

async function findByClientDateAmount(
  userId: string,
  candidate: InvoiceMatchCandidate
): Promise<InvoiceMatchResult | null> {
  const normalizedClient = normalizeText(candidate.clientName);
  const normalizedDate =
    normalizeIsoDate(candidate.issueDate) ?? normalizeIsoDate(candidate.dueDate);
  const amount = candidate.totalAmountCents;

  if (!normalizedClient || !normalizedDate || !Number.isFinite(amount)) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, client_name, issue_date, due_date, total_amount_cents, source_system"
    )
    .eq("user_id", userId)
    .eq("total_amount_cents", amount);

  if (error || !Array.isArray(data)) {
    return null;
  }

  const matches = (data as InvoiceLookupRow[]).filter((row) => {
    const rowClient = normalizeText(row.client_name);
    const rowDate =
      normalizeIsoDate(row.issue_date) ?? normalizeIsoDate(row.due_date);

    return rowClient === normalizedClient && rowDate === normalizedDate;
  });

  if (matches.length !== 1) {
    return matches.length > 1
      ? {
          decision: "flag_conflict",
          confidence: "manual_required",
          matchedInvoiceId: null,
          matchedBy: "client_date_amount",
          reason: "multiple invoices match client + date + amount",
        }
      : null;
  }

  const match = matches[0];
  if (!match) {
    return null;
  }

  return {
    decision: comparePriority(match.source_system, candidate.sourceSystem),
    confidence: "probable",
    matchedInvoiceId: match.id,
    matchedBy: "client_date_amount",
    reason: "client + date + amount match",
  };
}

export class AccountingMatchingService {
  static async matchInvoiceCandidate(
    userId: string,
    candidate: InvoiceMatchCandidate
  ): Promise<InvoiceMatchResult> {
    const externalMapMatch = await findByExternalIdMap(userId, candidate);
    if (externalMapMatch) {
      return externalMapMatch;
    }

    const sourceExternalMatch = await findBySourceExternalId(userId, candidate);
    if (sourceExternalMatch) {
      return sourceExternalMatch;
    }

    const invoiceNumberMatch = await findByInvoiceNumber(userId, candidate);
    if (invoiceNumberMatch) {
      return invoiceNumberMatch;
    }

    const probableMatch = await findByClientDateAmount(userId, candidate);
    if (probableMatch) {
      return probableMatch;
    }

    return {
      decision: "create_new",
      confidence: "manual_required",
      matchedInvoiceId: null,
      matchedBy: "none",
      reason: "no match found",
    };
  }
}