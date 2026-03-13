// apps/backend/src/services/connectors/accountingConnector.types.ts

export type AccountingProvider =
  | "pennylane"
  | "odoo"
  | "sage"
  | "quickbooks";

export type ExternalContactType = "client" | "supplier" | "both";

export type ExternalContact = {
  externalId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  type: ExternalContactType;
  rawPayload?: unknown;
};

export type ExternalInvoice = {
  externalId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmountCents: number | null;
  currency: string | null;
  status: string | null;
  rawPayload?: unknown;
};

export type ExternalBill = {
  externalId: string;
  billNumber: string | null;
  supplierName: string | null;
  issueDate: string | null;
  dueDate: string | null;
  totalAmountCents: number | null;
  currency: string | null;
  status: string | null;
  rawPayload?: unknown;
};

export type ExternalPayment = {
  externalId: string;
  invoiceExternalId: string | null;
  amountCents: number | null;
  currency: string | null;
  paymentDate: string | null;
  rawPayload?: unknown;
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

export type AccountingConnectorCapabilities = {
  contacts: boolean;
  salesInvoices: boolean;
  purchaseBills: boolean;
  payments: boolean;
  attachments?: boolean;
  analytic?: boolean;
};

export interface AccountingConnector {
  provider: AccountingProvider;
  capabilities: AccountingConnectorCapabilities;

  /**
   * Vérifie la connexion API
   */
  testConnection(): Promise<void>;

  /**
   * Contacts
   */
  listContacts?(since?: string): Promise<ExternalContact[]>;

  /**
   * Factures clients
   */
  listSalesInvoices?(since?: string): Promise<ExternalInvoice[]>;

  /**
   * Factures fournisseurs
   */
  listPurchaseBills?(since?: string): Promise<ExternalBill[]>;

  /**
   * Paiements
   */
  listPayments?(since?: string): Promise<ExternalPayment[]>;

  /**
   * Récupère une facture externe
   */
  getInvoice?(externalId: string): Promise<ExternalInvoice>;

  /**
   * Création facture dans le logiciel comptable
   */
  createInvoice?(
    input: CanonicalInvoiceInput
  ): Promise<{
    externalId: string;
  }>;

  /**
   * Mise à jour facture externe
   */
  updateInvoice?(
    externalId: string,
    input: CanonicalInvoiceInput
  ): Promise<void>;
}