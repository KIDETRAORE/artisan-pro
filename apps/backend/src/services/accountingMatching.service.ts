// apps/backend/src/services/accountingMatching.service.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";

export type AccountingSource =
  | "artisanpro"
  | "pennylane"
  | "odoo"
  | "sage"
  | "quickbooks"
  | "file_import"
  | "manual";

export const SOURCE_PRIORITY: Record<AccountingSource, number> = {
  pennylane: 300,
  odoo: 300,
  sage: 300,
  quickbooks: 300,
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
  type: "sale" | "purchase";
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

type CanonicalInvoiceLookupRow = {
  id: string;
  number: string | null;
  contact_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_amount_cents: number | null;
  source_system: string | null;
};

type ContactLookupRow = {
  id: string | null;
  name: string | null;
};

type CanonicalInvoiceDbRow = {
  id?: unknown;
  invoice_number?: unknown;
  bill_number?: unknown;
  contact_id?: unknown;
  issue_date?: unknown;
  due_date?: unknown;
  subtotal_cents?: unknown;
  tax_cents?: unknown;
  total_cents?: unknown;
  source_system?: unknown;
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function getCanonicalTable(
  candidate: InvoiceMatchCandidate
): "sales_invoices" | "purchase_bills" {
  return candidate.type === "purchase" ? "purchase_bills" : "sales_invoices";
}

function getNumberColumn(
  candidate: InvoiceMatchCandidate
): "invoice_number" | "bill_number" {
  return candidate.type === "purchase" ? "bill_number" : "invoice_number";
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function getRowAmountCents(row: CanonicalInvoiceDbRow): number | null {
  return toNullableNumber(row.total_cents);
}

async function getCanonicalInvoiceById(
  userId: string,
  candidate: InvoiceMatchCandidate,
  id: string
): Promise<{ id: string; source_system: string | null } | null> {
  const table = getCanonicalTable(candidate);

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, source_system")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return {
    id: String(data.id),
    source_system: toNullableString(data.source_system),
  };
}

async function listCanonicalInvoices(
  userId: string,
  candidate: InvoiceMatchCandidate
): Promise<CanonicalInvoiceLookupRow[]> {
  const table = getCanonicalTable(candidate);
  const numberColumn = getNumberColumn(candidate);

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(
      `id, ${numberColumn}, contact_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, source_system`
    )
    .eq("user_id", userId);

  if (error || !Array.isArray(data)) {
    return [];
  }

  return (data as CanonicalInvoiceDbRow[]).map((row) => ({
    id: String(row.id ?? ""),
    number:
      numberColumn === "bill_number"
        ? toNullableString(row.bill_number)
        : toNullableString(row.invoice_number),
    contact_id: toNullableString(row.contact_id),
    issue_date: toNullableString(row.issue_date),
    due_date: toNullableString(row.due_date),
    total_amount_cents: getRowAmountCents(row),
    source_system: toNullableString(row.source_system),
  }));
}

async function getContactsNameMap(
  contactIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, name")
    .in("id", uniqueIds);

  if (error || !Array.isArray(data)) {
    return new Map();
  }

  return new Map(
    (data as ContactLookupRow[])
      .filter(
        (row): row is { id: string; name: string | null } =>
          typeof row.id === "string"
      )
      .map((row) => [row.id, row.name ?? ""])
  );
}

async function findByExternalIdMap(
  userId: string,
  candidate: InvoiceMatchCandidate
): Promise<InvoiceMatchResult | null> {
  if (!candidate.sourceExternalId) return null;

  const { data, error } = await supabaseAdmin
    .from("external_id_map")
    .select("internal_id")
    .eq("user_id", userId)
    .eq("source_system", candidate.sourceSystem)
    .eq("external_entity_type", "invoice")
    .eq("external_id", candidate.sourceExternalId)
    .maybeSingle();

  if (error || !data?.internal_id) {
    return null;
  }

  const invoice = await getCanonicalInvoiceById(
    userId,
    candidate,
    String(data.internal_id)
  );

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

  const table = getCanonicalTable(candidate);

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, source_system")
    .eq("user_id", userId)
    .eq("source_system", candidate.sourceSystem)
    .eq("source_external_id", candidate.sourceExternalId)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return {
    decision: comparePriority(
      toNullableString(data.source_system),
      candidate.sourceSystem
    ),
    confidence: "exact",
    matchedInvoiceId: String(data.id),
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

  const rows = await listCanonicalInvoices(userId, candidate);

  const matches = rows.filter(
    (row) => normalizeReference(row.number) === normalizedRef
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
    reason:
      candidate.type === "purchase"
        ? "bill_number match"
        : "invoice_number match",
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

  if (!normalizedClient || !normalizedDate || !isFiniteNumber(amount)) {
    return null;
  }

  const rows = await listCanonicalInvoices(userId, candidate);
  const rowsWithAmount = rows.filter((row) => row.total_amount_cents === amount);

  if (rowsWithAmount.length === 0) {
    return null;
  }

  const contactsNameMap = await getContactsNameMap(
    rowsWithAmount
      .map((row) => row.contact_id)
      .filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0
      )
  );

  const matches = rowsWithAmount.filter((row) => {
    const rowContactName = normalizeText(
      row.contact_id ? contactsNameMap.get(row.contact_id) ?? null : null
    );
    const rowDate =
      normalizeIsoDate(row.issue_date) ?? normalizeIsoDate(row.due_date);

    return rowContactName === normalizedClient && rowDate === normalizedDate;
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