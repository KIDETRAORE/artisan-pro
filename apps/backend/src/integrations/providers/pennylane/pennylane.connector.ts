// apps/backend/src/integrations/providers/pennylane/pennylane.connector.ts
import { z } from "zod";
import { logger } from "../../../utils/logger";
import { HttpError } from "../../../utils/httpError";
import { ENV } from "../../../config/env";
import type {
  AccountingConnector,
  CanonicalInvoiceInput,
  ExternalBill,
  ExternalContact,
  ExternalInvoice,
  ExternalPayment,
} from "../../../services/connectors/accountingConnector.types";

/**
 * Pennylane Connector
 *
 * - compatible avec le refacto Accounting Hub
 * - conserve les méthodes statiques pushInvoice / updateInvoice
 *   pour le worker existant
 * - expose aussi l’interface canonique AccountingConnector
 */

export type PennylaneAuth =
  | { type: "api_key"; apiKey: string }
  | { type: "oauth"; accessToken: string };

export type PennylaneConnectorConfig = {
  apiKey: string;
  baseUrl?: string;
};

const PennylaneConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().min(1).default("https://api.pennylane.com"),
});

type PennylaneResolvedConfig = z.infer<typeof PennylaneConfigSchema>;

type PennylaneRequestOpts = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
};

type PennylaneCustomerInvoiceRecord = {
  id?: string | number | null;
  invoice_number?: string | null;
  number?: string | null;
  customer_name?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  issue_date?: string | null;
  date?: string | null;
  due_date?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  status?: string | null;
  archived_at?: string | null;
};

type PennylaneSupplierBillRecord = {
  id?: string | number | null;
  bill_number?: string | null;
  number?: string | null;
  supplier_name?: string | null;
  supplier?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  issue_date?: string | null;
  date?: string | null;
  due_date?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  status?: string | null;
  archived_at?: string | null;
};

type PennylanePaymentRecord = {
  id?: string | number | null;
  amount?: number | null;
  currency?: string | null;
  payment_date?: string | null;
  date?: string | null;
  invoice_id?: string | number | null;
};

type PennylaneContactRecord = {
  id?: string | number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  type?: "client" | "supplier" | "both" | string | null;
};

export type ArtisanProInvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  line_total_cents: number;
};

export type ArtisanProInvoice = {
  id: string;
  client_name: string;
  client_email: string | null;
  total_amount: number;
  due_date: string;
  status: string;
  lines: ArtisanProInvoiceLine[];
};

function isSyncEnabled(): boolean {
  return Boolean(ENV.PENNYLANE_SYNC_ENABLED);
}

function buildConfig(
  input?: Partial<PennylaneConnectorConfig>
): PennylaneResolvedConfig {
  const parsed = PennylaneConfigSchema.safeParse({
    apiKey:
      typeof input?.apiKey === "string" && input.apiKey.trim().length > 0
        ? input.apiKey.trim()
        : ENV.PENNYLANE_API_KEY,
    baseUrl:
      typeof input?.baseUrl === "string" && input.baseUrl.trim().length > 0
        ? input.baseUrl.trim()
        : ENV.PENNYLANE_BASE_URL || "https://api.pennylane.com",
  });

  if (!parsed.success) {
    logger.error("PennylaneConnector invalid config", {
      issues: parsed.error.issues,
    });
    throw new HttpError(500, "Pennylane connector misconfigured");
  }

  return parsed.data;
}

function getAuth(config: PennylaneResolvedConfig): PennylaneAuth {
  if (config.apiKey && config.apiKey.trim().length > 0) {
    return { type: "api_key", apiKey: config.apiKey };
  }

  throw new HttpError(400, "Pennylane is not connected (missing credentials)");
}

async function requestJson<T>(
  config: PennylaneResolvedConfig,
  opts: PennylaneRequestOpts
): Promise<T> {
  const auth = getAuth(config);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (auth.type === "api_key") {
    headers.Authorization = `Bearer ${auth.apiKey}`;
  } else {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  const url = `${config.baseUrl}${opts.path}`;

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const meta = {
      status: res.status,
      method: opts.method,
      path: opts.path,
      response: text?.slice(0, 500),
    };

    if (res.status === 401 || res.status === 403) {
      logger.warn("Pennylane request unauthorized/forbidden", meta);
      throw new HttpError(401, "Pennylane unauthorized");
    }

    if (res.status === 429) {
      logger.warn("Pennylane request rate-limited", meta);
      throw new HttpError(429, "Pennylane rate limit");
    }

    logger.error("Pennylane request failed", meta);
    throw new HttpError(502, "Pennylane API error");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const json = (await res.json().catch(() => null)) as T | null;
  if (!json) {
    throw new HttpError(502, "Invalid Pennylane response");
  }

  return json;
}

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function eurosToCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100);
}

function normalizeDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return parsed.toISOString().slice(0, 10);
}

function transformInvoice(invoice: ArtisanProInvoice) {
  return {
    external_id: invoice.id,
    customer: {
      name: invoice.client_name,
      email: invoice.client_email ?? undefined,
    },
    due_date: normalizeDate(invoice.due_date),
    status: invoice.status,
    origin: "artisanpro",
    total_amount: invoice.total_amount,
    line_items: invoice.lines.map((l) => ({
      external_id: l.id,
      description: l.description,
      quantity: l.quantity,
      unit_price: centsToEuros(l.unit_price_cents),
      tax_rate: l.tax_rate,
      line_total: centsToEuros(l.line_total_cents),
    })),
  };
}

function toExternalId(value: unknown): string {
  return String(value ?? "").trim();
}

function mapCustomerInvoice(
  record: PennylaneCustomerInvoiceRecord
): ExternalInvoice {
  return {
    externalId: toExternalId(record.id),
    invoiceNumber:
      String(record.invoice_number ?? record.number ?? "").trim() || null,
    clientName:
      String(
        record.customer?.name ?? record.customer_name ?? ""
      ).trim() || null,
    issueDate: normalizeDate(record.issue_date ?? record.date ?? null),
    dueDate: normalizeDate(record.due_date ?? null),
    totalAmountCents: eurosToCents(record.total_amount),
    currency: String(record.currency ?? "EUR").trim() || "EUR",
    status: String(record.status ?? "").trim() || null,
    rawPayload: record,
  };
}

function mapSupplierBill(record: PennylaneSupplierBillRecord): ExternalBill {
  return {
    externalId: toExternalId(record.id),
    billNumber:
      String(record.bill_number ?? record.number ?? "").trim() || null,
    supplierName:
      String(
        record.supplier?.name ?? record.supplier_name ?? ""
      ).trim() || null,
    issueDate: normalizeDate(record.issue_date ?? record.date ?? null),
    dueDate: normalizeDate(record.due_date ?? null),
    totalAmountCents: eurosToCents(record.total_amount),
    currency: String(record.currency ?? "EUR").trim() || "EUR",
    status: String(record.status ?? "").trim() || null,
    rawPayload: record,
  };
}

function mapPayment(record: PennylanePaymentRecord): ExternalPayment {
  const invoiceExternalId = toExternalId(record.invoice_id) || null;

  return {
    externalId: toExternalId(record.id),
    invoiceExternalId,
    amountCents: eurosToCents(record.amount),
    currency: String(record.currency ?? "EUR").trim() || "EUR",
    paymentDate: normalizeDate(record.payment_date ?? record.date ?? null),
    rawPayload: record,
  };
}

function mapContact(record: PennylaneContactRecord): ExternalContact {
  const normalizedType = String(record.type ?? "").trim().toLowerCase();

  return {
    externalId: toExternalId(record.id),
    name: String(record.name ?? "").trim() || "Contact",
    email: String(record.email ?? "").trim() || null,
    phone: String(record.phone ?? "").trim() || null,
    type:
      normalizedType === "supplier"
        ? "supplier"
        : normalizedType === "both"
          ? "both"
          : "client",
  };
}

function buildCustomerInvoicePayload(input: CanonicalInvoiceInput) {
  return {
    invoice_number: input.invoiceNumber ?? undefined,
    customer: {
      name: input.clientName ?? undefined,
    },
    issue_date: normalizeDate(input.issueDate),
    due_date: normalizeDate(input.dueDate),
    total_amount:
      typeof input.totalAmountCents === "number"
        ? centsToEuros(input.totalAmountCents)
        : undefined,
    currency: input.currency ?? "EUR",
    status: input.status ?? undefined,
    origin: "artisanpro",
  };
}

export class PennylaneConnector implements AccountingConnector {
  readonly provider = "pennylane" as const;

  readonly capabilities = {
    contacts: true,
    salesInvoices: true,
    purchaseBills: true,
    payments: true,
    attachments: false,
    analytic: false,
  } as const;

  private readonly config: PennylaneResolvedConfig;

  constructor(config: PennylaneConnectorConfig) {
    this.config = buildConfig(config);
  }

  async testConnection(): Promise<void> {
    if (!isSyncEnabled()) {
      return;
    }

    await requestJson<unknown>(this.config, {
      method: "GET",
      path: "/api/external/v1/customer_invoices?per_page=1",
    });
  }

  async listContacts(): Promise<ExternalContact[]> {
    if (!isSyncEnabled()) {
      return [];
    }

    const records = await requestJson<
      PennylaneContactRecord[] | { data?: PennylaneContactRecord[] }
    >(this.config, {
      method: "GET",
      path: "/api/external/v1/customers",
    });

    const items = Array.isArray(records) ? records : records.data ?? [];

    return items
      .map(mapContact)
      .filter((item) => item.externalId.length > 0);
  }

  async listSalesInvoices(): Promise<ExternalInvoice[]> {
    if (!isSyncEnabled()) {
      return [];
    }

    const records = await requestJson<
      PennylaneCustomerInvoiceRecord[] | {
        data?: PennylaneCustomerInvoiceRecord[];
      }
    >(this.config, {
      method: "GET",
      path: "/api/external/v1/customer_invoices",
    });

    const items = Array.isArray(records) ? records : records.data ?? [];

    return items
      .map(mapCustomerInvoice)
      .filter((item) => item.externalId.length > 0);
  }

  async listPurchaseBills(): Promise<ExternalBill[]> {
    if (!isSyncEnabled()) {
      return [];
    }

    const records = await requestJson<
      PennylaneSupplierBillRecord[] | {
        data?: PennylaneSupplierBillRecord[];
      }
    >(this.config, {
      method: "GET",
      path: "/api/external/v1/supplier_invoices",
    });

    const items = Array.isArray(records) ? records : records.data ?? [];

    return items
      .map(mapSupplierBill)
      .filter((item) => item.externalId.length > 0);
  }

  async listPayments(): Promise<ExternalPayment[]> {
    if (!isSyncEnabled()) {
      return [];
    }

    const records = await requestJson<
      PennylanePaymentRecord[] | { data?: PennylanePaymentRecord[] }
    >(this.config, {
      method: "GET",
      path: "/api/external/v1/payments",
    });

    const items = Array.isArray(records) ? records : records.data ?? [];

    return items
      .map(mapPayment)
      .filter((item) => item.externalId.length > 0);
  }

  async getInvoice(externalId: string): Promise<ExternalInvoice> {
    const normalizedId = String(externalId ?? "").trim();

    if (!normalizedId) {
      throw new HttpError(400, "Pennylane invoice externalId is required");
    }

    if (!isSyncEnabled()) {
      return {
        externalId: normalizedId,
        invoiceNumber: null,
        clientName: null,
        issueDate: null,
        dueDate: null,
        totalAmountCents: null,
        currency: "EUR",
        status: "draft",
        rawPayload: { stub: true, externalId: normalizedId },
      };
    }

    const record = await requestJson<PennylaneCustomerInvoiceRecord>(
      this.config,
      {
        method: "GET",
        path: `/api/external/v1/customer_invoices/${encodeURIComponent(
          normalizedId
        )}`,
      }
    );

    const mapped = mapCustomerInvoice(record);

    if (!mapped.externalId) {
      throw new HttpError(404, "Pennylane invoice not found");
    }

    return mapped;
  }

  async createInvoice(
    input: CanonicalInvoiceInput
  ): Promise<{ externalId: string }> {
    const payload = buildCustomerInvoicePayload(input);

    if (!isSyncEnabled()) {
      return {
        externalId: `pennylane_stub_${Date.now()}`,
      };
    }

    const created = await requestJson<{ id?: string | number | null }>(
      this.config,
      {
        method: "POST",
        path: "/api/external/v1/customer_invoices",
        body: payload,
      }
    );

    const externalId = toExternalId(created?.id);

    if (!externalId) {
      throw new HttpError(502, "Pennylane create invoice response missing id");
    }

    return { externalId };
  }

  async updateInvoice(
    externalId: string,
    input: CanonicalInvoiceInput
  ): Promise<void> {
    const normalizedId = String(externalId ?? "").trim();

    if (!normalizedId) {
      throw new HttpError(400, "Pennylane invoice externalId is required");
    }

    const payload = buildCustomerInvoicePayload(input);

    if (!isSyncEnabled()) {
      return;
    }

    await requestJson<unknown>(this.config, {
      method: "PATCH",
      path: `/api/external/v1/customer_invoices/${encodeURIComponent(
        normalizedId
      )}`,
      body: payload,
    });
  }

  static async pushInvoice(
    invoice: ArtisanProInvoice
  ): Promise<{ externalId: string }> {
    const connector = new PennylaneConnector({
      apiKey: buildConfig().apiKey,
      baseUrl: buildConfig().baseUrl,
    });

    const payload = transformInvoice(invoice);

    logger.info("PennylaneConnector.pushInvoice ready", {
      invoiceId: invoice.id,
      linesCount: invoice.lines.length,
    });

    if (!isSyncEnabled()) {
      return { externalId: `pennylane_stub_${invoice.id}` };
    }

    const created = await requestJson<{ id?: string | number | null }>(
      connector.config,
      {
        method: "POST",
        path: "/api/external/v1/customer_invoices",
        body: payload,
      }
    );

    const externalId = toExternalId(created?.id);

    if (!externalId) {
      throw new HttpError(502, "Pennylane create invoice response missing id");
    }

    return { externalId };
  }

  static async updateInvoice(
    externalId: string,
    invoice: ArtisanProInvoice
  ): Promise<{ externalId: string }> {
    const connector = new PennylaneConnector({
      apiKey: buildConfig().apiKey,
      baseUrl: buildConfig().baseUrl,
    });

    const normalizedId = String(externalId ?? "").trim();
    if (!normalizedId) {
      throw new HttpError(400, "Pennylane invoice externalId is required");
    }

    const payload = transformInvoice(invoice);

    logger.info("PennylaneConnector.updateInvoice ready", {
      invoiceId: invoice.id,
      externalId: normalizedId,
      linesCount: invoice.lines.length,
    });

    if (!isSyncEnabled()) {
      return { externalId: normalizedId };
    }

    await requestJson<unknown>(connector.config, {
      method: "PATCH",
      path: `/api/external/v1/customer_invoices/${encodeURIComponent(
        normalizedId
      )}`,
      body: payload,
    });

    return { externalId: normalizedId };
  }
}