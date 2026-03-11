// apps/backend/src/services/connectors/odoo.connector.ts
import { HttpError } from "../../utils/httpError";
import { logger } from "../../utils/logger";
import {
  type AccountingConnector,
  type CanonicalInvoiceInput,
  type ExternalInvoice,
  type ExternalPayment,
} from "./accountingConnector.types";

export type OdooConnectorConfig = {
  baseUrl: string;
  database: string;
  apiKey: string;
  login: string;
  timeoutMs?: number;
};

type OdooJson2Envelope<T> = {
  result?: T;
};

type OdooInvoiceRecord = {
  id?: number;
  name?: string | null;
  ref?: string | null;
  partner_id?: [number, string] | number | null;
  invoice_date?: string | null;
  date?: string | null;
  invoice_date_due?: string | null;
  amount_total?: number | null;
  currency_id?: [number, string] | number | null;
  state?: string | null;
  payment_state?: string | null;
  move_type?: string | null;
};

type OdooPaymentRecord = {
  id?: number;
  ref?: string | null;
  amount?: number | null;
  currency_id?: [number, string] | number | null;
  date?: string | null;
  payment_date?: string | null;
  move_id?: [number, string] | number | null;
  reconciled_invoice_ids?: number[] | null;
};

function normalizeBaseUrl(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new HttpError(400, "Odoo baseUrl is required");
  }
  return raw.replace(/\/+$/, "");
}

function toIsoDate(value: unknown): string | null {
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

function extractDisplayName(
  value: [number, string] | number | null | undefined
): string | null {
  if (Array.isArray(value)) {
    return String(value[1] ?? "").trim() || null;
  }

  return null;
}

function extractCurrencyCode(
  value: [number, string] | number | null | undefined
): string | null {
  if (Array.isArray(value)) {
    return String(value[1] ?? "").trim() || null;
  }

  return null;
}

function mapOdooInvoice(record: OdooInvoiceRecord): ExternalInvoice {
  const status =
    String(record.payment_state ?? "").trim() ||
    String(record.state ?? "").trim() ||
    null;

  const clientName = extractDisplayName(record.partner_id);
  const invoiceNumber =
    typeof record.name === "string" && record.name.trim().length > 0
      ? record.name.trim()
      : typeof record.ref === "string" && record.ref.trim().length > 0
        ? record.ref.trim()
        : `ODOO-${record.id}`;

  logger.info("OdooConnector.mapOdooInvoice partner mapping", {
    externalId: String(record.id ?? "").trim(),
    invoiceNumber,
    partner_id: record.partner_id ?? null,
    extractedClientName: clientName,
    moveType: record.move_type ?? null,
  });

  return {
    externalId: String(record.id ?? "").trim(),
    invoiceNumber,
    clientName,
    issueDate: toIsoDate(record.invoice_date ?? record.date),
    dueDate: toIsoDate(record.invoice_date_due),
    totalAmountCents:
      typeof record.amount_total === "number" &&
      Number.isFinite(record.amount_total)
        ? Math.round(record.amount_total * 100)
        : null,
    currency: extractCurrencyCode(record.currency_id) ?? "EUR",
    status,
    rawPayload: record,
  };
}

function mapOdooPayment(record: OdooPaymentRecord): ExternalPayment {
  const firstInvoiceId =
    Array.isArray(record.reconciled_invoice_ids) &&
    record.reconciled_invoice_ids.length > 0
      ? String(record.reconciled_invoice_ids[0] ?? "").trim()
      : null;

  return {
    externalId: String(record.id ?? "").trim(),
    invoiceExternalId: firstInvoiceId,
    amountCents:
      typeof record.amount === "number" && Number.isFinite(record.amount)
        ? Math.round(record.amount * 100)
        : null,
    currency: extractCurrencyCode(record.currency_id) ?? "EUR",
    paymentDate: toIsoDate(record.payment_date ?? record.date),
    rawPayload: record,
  };
}

export class OdooConnector implements AccountingConnector {
  readonly provider = "odoo" as const;

  private readonly baseUrl: string;
  private readonly database: string;
  private readonly apiKey: string;
  private readonly login: string;
  private readonly timeoutMs: number;

  constructor(config: OdooConnectorConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.database = String(config.database ?? "").trim();
    this.apiKey = String(config.apiKey ?? "").trim();
    this.login = String(config.login ?? "").trim();
    this.timeoutMs = config.timeoutMs ?? 15000;

    if (!this.database) {
      throw new HttpError(400, "Odoo database is required");
    }

    if (!this.apiKey) {
      throw new HttpError(400, "Odoo apiKey is required");
    }

    if (!this.login) {
      throw new HttpError(400, "Odoo login is required");
    }
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Odoo-Database": this.database,
          "X-Odoo-Login": this.login,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new HttpError(
          response.status,
          `Odoo request failed: ${text || response.statusText}`
        );
      }

      const payload = (await response.json()) as OdooJson2Envelope<T> | T;

      if (
        payload &&
        typeof payload === "object" &&
        "result" in (payload as OdooJson2Envelope<T>)
      ) {
        return ((payload as OdooJson2Envelope<T>).result ?? []) as T;
      }

      return payload as T;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new HttpError(504, "Odoo request timeout");
      }

      throw new HttpError(502, "Odoo request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  async testConnection(): Promise<void> {
    await this.request<unknown[]>("/json/2/account.move/search_read", {
      domain: [["move_type", "in", ["out_invoice", "in_invoice"]]],
      fields: ["id"],
      limit: 1,
    });
  }

  async listInvoices(_since?: string): Promise<ExternalInvoice[]> {
    const domain: unknown[] = [["move_type", "in", ["out_invoice", "in_invoice"]]];

    const records = await this.request<OdooInvoiceRecord[]>(
      "/json/2/account.move/search_read",
      {
        domain,
        fields: [
          "id",
          "name",
          "ref",
          "partner_id",
          "invoice_date",
          "date",
          "invoice_date_due",
          "amount_total",
          "currency_id",
          "state",
          "payment_state",
          "move_type",
        ],
        order: "id desc",
      }
    );

    return (Array.isArray(records) ? records : [])
      .map(mapOdooInvoice)
      .filter((invoice) => invoice.externalId.length > 0);
  }

  async getInvoice(externalId: string): Promise<ExternalInvoice> {
    const id = Number(externalId);
    if (!Number.isFinite(id)) {
      throw new HttpError(400, "Invalid Odoo invoice id");
    }

    const records = await this.request<OdooInvoiceRecord[]>(
      "/json/2/account.move/read",
      {
        ids: [id],
        fields: [
          "id",
          "name",
          "ref",
          "partner_id",
          "invoice_date",
          "date",
          "invoice_date_due",
          "amount_total",
          "currency_id",
          "state",
          "payment_state",
          "move_type",
        ],
      }
    );

    const first = Array.isArray(records) ? records[0] : null;
    if (!first?.id) {
      throw new HttpError(404, "Odoo invoice not found");
    }

    return mapOdooInvoice(first);
  }

  async createInvoice(
    input: CanonicalInvoiceInput
  ): Promise<{ externalId: string }> {
    const payload = {
      move_type: "out_invoice",
      invoice_date: input.issueDate,
      invoice_date_due: input.dueDate,
      ref: input.invoiceNumber,
      narration: input.clientName ?? undefined,
    };

    const result = await this.request<number | number[]>(
      "/json/2/account.move/create",
      payload
    );

    const createdId = Array.isArray(result) ? result[0] : result;
    const externalId = String(createdId ?? "").trim();

    if (!externalId) {
      throw new HttpError(502, "Odoo create invoice response missing id");
    }

    return { externalId };
  }

  async updateInvoice(
    externalId: string,
    input: CanonicalInvoiceInput
  ): Promise<void> {
    const id = Number(externalId);
    if (!Number.isFinite(id)) {
      throw new HttpError(400, "Invalid Odoo invoice id");
    }

    await this.request<boolean>("/json/2/account.move/write", {
      ids: [id],
      vals: {
        invoice_date: input.issueDate,
        invoice_date_due: input.dueDate,
        ref: input.invoiceNumber,
        narration: input.clientName ?? undefined,
      },
    });
  }

  async listPayments(_since?: string): Promise<ExternalPayment[]> {
    const domain: unknown[] = [];

    const records = await this.request<OdooPaymentRecord[]>(
      "/json/2/account.payment/search_read",
      {
        domain,
        fields: [
          "id",
          "ref",
          "amount",
          "currency_id",
          "date",
          "payment_date",
          "move_id",
          "reconciled_invoice_ids",
        ],
        order: "id desc",
      }
    );

    return (Array.isArray(records) ? records : [])
      .map(mapOdooPayment)
      .filter((payment) => payment.externalId.length > 0);
  }
}