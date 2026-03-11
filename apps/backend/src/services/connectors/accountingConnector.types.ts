// apps/backend/src/services/connectors/accountingConnector.types.ts

export type AccountingProvider =
  | "pennylane"
  | "odoo";

export type ExternalInvoiceType = "sale" | "purchase";

export type ExternalInvoice = {
  externalId: string;
  type: ExternalInvoiceType;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmountCents: number | null;
  currency: string | null;
  status: string | null;
  rawPayload: unknown;
};

export type ExternalPayment = {
  externalId: string;
  invoiceExternalId: string | null;
  amountCents: number | null;
  currency: string | null;
  paymentDate: string | null;
  rawPayload: unknown;
};

export type CanonicalInvoiceInput = {
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmountCents: number | null;
  currency: string | null;
  status: string | null;
};

export interface AccountingConnector {
  provider: AccountingProvider;

  /**
   * Vérifie la connexion API
   */
  testConnection(): Promise<void>;

  /**
   * Liste les factures externes
   */
  listInvoices(since?: string): Promise<ExternalInvoice[]>;

  /**
   * Récupère une facture externe
   */
  getInvoice(externalId: string): Promise<ExternalInvoice>;

  /**
   * Crée une facture dans le logiciel comptable
   */
  createInvoice(input: CanonicalInvoiceInput): Promise<{
    externalId: string;
  }>;

  /**
   * Met à jour une facture externe
   */
  updateInvoice(
    externalId: string,
    input: CanonicalInvoiceInput
  ): Promise<void>;

  /**
   * Liste les paiements
   */
  listPayments?(since?: string): Promise<ExternalPayment[]>;
}