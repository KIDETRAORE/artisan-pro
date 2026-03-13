// apps/backend/src/services/accountingSync.service.ts
import { AccountingConnectorFactory } from "./accountingConnector.factory";
import {
  AccountingMatchingService,
  type AccountingSource,
} from "./accountingMatching.service";
import { IntegrationsService } from "./integrations.service";
import { ExternalIdMapService } from "./externalIdMap.service";
import { ContactsService } from "./contacts.service";
import { SalesInvoicesService } from "./salesInvoices.service";
import { PurchaseBillsService } from "./purchaseBills.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import type {
  AccountingConnector,
  ExternalBill,
  ExternalContact,
  ExternalInvoice,
  ExternalPayment,
} from "./connectors/accountingConnector.types";

type SupportedSyncProvider = Extract<AccountingSource, "pennylane" | "odoo">;

export type SyncResult = {
  created: number;
  linked: number;
  upgraded: number;
  ignored: number;
  conflicts: number;
};

type ExternalSyncCandidate = {
  type: "sale" | "purchase";
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

type SyncFamily = "sale" | "purchase";

function isSupportedSyncProvider(
  provider: AccountingSource
): provider is SupportedSyncProvider {
  return provider === "pennylane" || provider === "odoo";
}

function emptySyncResult(): SyncResult {
  return {
    created: 0,
    linked: 0,
    upgraded: 0,
    ignored: 0,
    conflicts: 0,
  };
}

function toSyncCandidate(
  external: ExternalInvoice | ExternalBill,
  type: SyncFamily
): ExternalSyncCandidate {
  if (type === "purchase") {
    const bill = external as ExternalBill;

    return {
      type,
      externalId: String(bill.externalId ?? "").trim(),
      invoiceNumber: bill.billNumber ?? null,
      clientName: bill.supplierName ?? null,
      issueDate: bill.issueDate ?? null,
      dueDate: bill.dueDate ?? null,
      totalAmountCents: bill.totalAmountCents ?? null,
      currency: bill.currency ?? null,
      status: bill.status ?? null,
      rawPayload: bill.rawPayload,
    };
  }

  const invoice = external as ExternalInvoice;

  return {
    type,
    externalId: String(invoice.externalId ?? "").trim(),
    invoiceNumber: invoice.invoiceNumber ?? null,
    clientName: invoice.clientName ?? null,
    issueDate: invoice.issueDate ?? null,
    dueDate: invoice.dueDate ?? null,
    totalAmountCents: invoice.totalAmountCents ?? null,
    currency: invoice.currency ?? null,
    status: invoice.status ?? null,
    rawPayload: invoice.rawPayload,
  };
}

function normalizeExternalItems(
  items: ExternalSyncCandidate[]
): ExternalSyncCandidate[] {
  return items.filter((item) => item.externalId.length > 0);
}

function getExternalContactType(
  external: ExternalSyncCandidate
): "client" | "supplier" {
  return external.type === "purchase" ? "supplier" : "client";
}

function getExternalDisplayName(external: ExternalSyncCandidate): string {
  if (
    typeof external.clientName === "string" &&
    external.clientName.trim().length > 0
  ) {
    return external.clientName.trim();
  }

  return external.type === "purchase" ? "Supplier" : "Client";
}

function getExternalAmountCents(external: ExternalSyncCandidate): number | null {
  if (
    typeof external.totalAmountCents === "number" &&
    Number.isFinite(external.totalAmountCents)
  ) {
    return Math.round(external.totalAmountCents);
  }

  return null;
}

function mergeSyncResults(a: SyncResult, b: SyncResult): SyncResult {
  return {
    created: a.created + b.created,
    linked: a.linked + b.linked,
    upgraded: a.upgraded + b.upgraded,
    ignored: a.ignored + b.ignored,
    conflicts: a.conflicts + b.conflicts,
  };
}

async function buildConnector(
  userId: string,
  provider: SupportedSyncProvider
): Promise<AccountingConnector> {
  if (provider === "pennylane") {
    const apiKey = await IntegrationsService.getPennylaneApiKey(userId);

    if (!apiKey) {
      throw new HttpError(400, "Pennylane is not configured");
    }

    return AccountingConnectorFactory.create({
      provider: "pennylane",
      config: {
        apiKey,
      },
    });
  }

  const credential = await IntegrationsService.getOdooCredential(userId);

  if (!credential) {
    throw new HttpError(400, "Odoo is not configured");
  }

  return AccountingConnectorFactory.create({
    provider: "odoo",
    config: {
      baseUrl: credential.baseUrl,
      database: credential.database,
      login: credential.login,
      apiKey: credential.apiKey,
    },
  });
}

async function getLastCursor(
  userId: string,
  provider: SupportedSyncProvider
): Promise<string | null> {
  if (provider === "pennylane") {
    return await IntegrationsService.getPennylaneLastCursor(userId);
  }

  return await IntegrationsService.getOdooLastCursor(userId);
}

async function markSyncSuccess(
  userId: string,
  provider: SupportedSyncProvider,
  lastCursor: string
): Promise<void> {
  if (provider === "pennylane") {
    await IntegrationsService.markPennylaneSyncSuccess(userId, lastCursor);
    return;
  }

  await IntegrationsService.markOdooSyncSuccess(userId, lastCursor);
}

async function markSyncError(
  userId: string,
  provider: SupportedSyncProvider,
  errorMessage: string
): Promise<void> {
  if (provider === "pennylane") {
    await IntegrationsService.markPennylaneSyncError(userId, errorMessage);
    return;
  }

  await IntegrationsService.markOdooSyncError(userId, errorMessage);
}

async function insertSyncEvent(params: {
  userId: string;
  provider: SupportedSyncProvider;
  status: "success" | "error";
  message: string;
  objectType?: string | null;
  objectId?: string | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("sync_events").insert({
    user_id: params.userId,
    provider: params.provider,
    status: params.status,
    message: params.message,
    object_type: params.objectType ?? "sync",
    object_id: params.objectId ?? null,
  });

  if (error) {
    logger.warn("AccountingSyncService.insertSyncEvent failed", {
      userId: params.userId,
      provider: params.provider,
      status: params.status,
      message: error.message,
    });
  }
}

async function syncContacts(params: {
  userId: string;
  provider: SupportedSyncProvider;
  contacts: ExternalContact[];
}): Promise<void> {
  for (const contact of params.contacts) {
    try {
      await ContactsService.findOrCreateContact({
        userId: params.userId,
        sourceSystem: params.provider,
        input: {
          name:
            typeof contact.name === "string" && contact.name.trim().length > 0
              ? contact.name.trim()
              : "Contact",
          contact_type:
            contact.type === "supplier"
              ? "supplier"
              : contact.type === "both"
                ? "both"
                : "client",
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          source_system: params.provider,
          source_external_id:
            typeof contact.externalId === "string" &&
            contact.externalId.trim().length > 0
              ? contact.externalId.trim()
              : null,
        },
      });
    } catch (err) {
      logger.error("AccountingSync contact sync error", {
        userId: params.userId,
        provider: params.provider,
        externalId: contact.externalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function syncPayments(params: {
  userId: string;
  provider: SupportedSyncProvider;
  payments: ExternalPayment[];
}): Promise<void> {
  for (const payment of params.payments) {
    logger.info("AccountingSync payment fetched", {
      userId: params.userId,
      provider: params.provider,
      externalId: payment.externalId,
      invoiceExternalId: payment.invoiceExternalId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      paymentDate: payment.paymentDate,
    });
  }
}

async function createCanonicalInvoice(params: {
  userId: string;
  provider: SupportedSyncProvider;
  external: ExternalSyncCandidate;
  contactId: string;
}): Promise<{ id: string }> {
  const { userId, provider, external, contactId } = params;
  const amountCents = getExternalAmountCents(external);

  if (external.type === "purchase") {
    const createdBill = await PurchaseBillsService.createPurchaseBill(userId, {
      contact_id: contactId,
      issue_date: external.issueDate ?? null,
      due_date: external.dueDate ?? null,
      subtotal_cents: amountCents ?? 0,
      tax_cents: 0,
      total_cents: amountCents ?? 0,
      status: "posted",
      source_system: provider,
      source_external_id: external.externalId,
      origin_type: "compta_import",
      bill_number: external.invoiceNumber ?? null,
      currency: external.currency ?? "EUR",
    });

    return { id: createdBill.id };
  }

  const createdInvoice = await SalesInvoicesService.createSalesInvoice(userId, {
    contact_id: contactId,
    issue_date: external.issueDate ?? null,
    due_date: external.dueDate ?? null,
    subtotal_cents: amountCents ?? 0,
    tax_cents: 0,
    total_cents: amountCents ?? 0,
    status: "sent",
    source_system: provider,
    source_external_id: external.externalId,
    origin_type: "compta_import",
    invoice_number: external.invoiceNumber ?? null,
    currency: external.currency ?? "EUR",
  });

  return { id: createdInvoice.id };
}

async function updateCanonicalInvoiceLink(params: {
  userId: string;
  provider: SupportedSyncProvider;
  external: ExternalSyncCandidate;
  internalId: string;
  contactId: string;
}): Promise<void> {
  const { userId, provider, external, internalId, contactId } = params;
  const amountCents = getExternalAmountCents(external);

  if (external.type === "purchase") {
    await PurchaseBillsService.updatePurchaseBill(userId, internalId, {
      contact_id: contactId,
      source_system: provider,
      source_external_id: external.externalId,
      bill_number:
        typeof external.invoiceNumber === "string" &&
        external.invoiceNumber.trim().length > 0
          ? external.invoiceNumber.trim()
          : undefined,
      due_date:
        typeof external.dueDate === "string" &&
        external.dueDate.trim().length > 0
          ? external.dueDate.trim()
          : undefined,
      issue_date:
        typeof external.issueDate === "string" &&
        external.issueDate.trim().length > 0
          ? external.issueDate.trim()
          : undefined,
      ...(amountCents !== null
        ? {
            subtotal_cents: amountCents,
            tax_cents: 0,
            total_cents: amountCents,
          }
        : {}),
      currency: external.currency ?? undefined,
      status: "posted",
    });

    return;
  }

  await SalesInvoicesService.updateSalesInvoice(userId, internalId, {
    contact_id: contactId,
    source_system: provider,
    source_external_id: external.externalId,
    invoice_number:
      typeof external.invoiceNumber === "string" &&
      external.invoiceNumber.trim().length > 0
        ? external.invoiceNumber.trim()
        : undefined,
    due_date:
      typeof external.dueDate === "string" &&
      external.dueDate.trim().length > 0
        ? external.dueDate.trim()
        : undefined,
    issue_date:
      typeof external.issueDate === "string" &&
      external.issueDate.trim().length > 0
        ? external.issueDate.trim()
        : undefined,
    ...(amountCents !== null
      ? {
          subtotal_cents: amountCents,
          tax_cents: 0,
          total_cents: amountCents,
        }
      : {}),
    currency: external.currency ?? undefined,
  });
}

async function upgradeCanonicalInvoiceSource(params: {
  userId: string;
  provider: SupportedSyncProvider;
  external: ExternalSyncCandidate;
  internalId: string;
}): Promise<void> {
  const { userId, provider, external, internalId } = params;

  if (external.type === "purchase") {
    await PurchaseBillsService.updatePurchaseBill(userId, internalId, {
      origin_type: "compta_import",
      source_system: provider,
      source_external_id: external.externalId,
    });

    return;
  }

  await SalesInvoicesService.updateSalesInvoice(userId, internalId, {
    origin_type: "compta_import",
    source_system: provider,
    source_external_id: external.externalId,
  });
}

async function syncInvoiceFamily(params: {
  userId: string;
  provider: SupportedSyncProvider;
  family: SyncFamily;
  externalItems: ExternalSyncCandidate[];
}): Promise<SyncResult> {
  const stats = emptySyncResult();

  for (const external of params.externalItems) {
    try {
      const contactType = getExternalContactType(external);
      const displayName = getExternalDisplayName(external);

      logger.info("AccountingSync processing external document", {
        userId: params.userId,
        provider: params.provider,
        family: params.family,
        externalId: external.externalId,
        invoiceNumber: external.invoiceNumber,
        clientName: external.clientName,
        issueDate: external.issueDate,
        dueDate: external.dueDate,
        totalAmountCents: external.totalAmountCents,
        status: external.status ?? null,
      });

      const match = await AccountingMatchingService.matchInvoiceCandidate(
        params.userId,
        {
          type: external.type,
          sourceSystem: params.provider,
          sourceExternalId: external.externalId,
          invoiceNumber: external.invoiceNumber,
          clientName: external.clientName,
          issueDate: external.issueDate,
          dueDate: external.dueDate,
          totalAmountCents: external.totalAmountCents,
        }
      );

      logger.info("AccountingSync document match result", {
        userId: params.userId,
        provider: params.provider,
        family: params.family,
        externalId: external.externalId,
        decision: match.decision,
        confidence: match.confidence,
        matchedInvoiceId: match.matchedInvoiceId,
        matchedBy: match.matchedBy,
        reason: match.reason,
      });

      if (match.decision === "create_new") {
        const contact = await ContactsService.findOrCreateContact({
          userId: params.userId,
          sourceSystem: params.provider,
          input: {
            name: displayName,
            contact_type: contactType,
            email: null,
            source_system: params.provider,
            source_external_id: external.externalId,
          },
        });

        const createdInvoice = await createCanonicalInvoice({
          userId: params.userId,
          provider: params.provider,
          external,
          contactId: contact.id,
        });

        await ExternalIdMapService.upsertExternalMapping({
          userId: params.userId,
          sourceSystem: params.provider,
          externalEntityType: "invoice",
          externalId: external.externalId,
          internalId: createdInvoice.id,
        });

        stats.created += 1;
        continue;
      }

      if (match.decision === "link_existing" && match.matchedInvoiceId) {
        const contact = await ContactsService.findOrCreateContact({
          userId: params.userId,
          sourceSystem: params.provider,
          input: {
            name: displayName,
            contact_type: contactType,
            email: null,
            source_system: params.provider,
            source_external_id: external.externalId,
          },
        });

        await updateCanonicalInvoiceLink({
          userId: params.userId,
          provider: params.provider,
          external,
          internalId: match.matchedInvoiceId,
          contactId: contact.id,
        });

        await ExternalIdMapService.upsertExternalMapping({
          userId: params.userId,
          sourceSystem: params.provider,
          externalEntityType: "invoice",
          externalId: external.externalId,
          internalId: match.matchedInvoiceId,
        });

        stats.linked += 1;
        continue;
      }

      if (match.decision === "upgrade_source" && match.matchedInvoiceId) {
        await upgradeCanonicalInvoiceSource({
          userId: params.userId,
          provider: params.provider,
          external,
          internalId: match.matchedInvoiceId,
        });

        await ExternalIdMapService.upsertExternalMapping({
          userId: params.userId,
          sourceSystem: params.provider,
          externalEntityType: "invoice",
          externalId: external.externalId,
          internalId: match.matchedInvoiceId,
        });

        stats.upgraded += 1;
        continue;
      }

      if (match.decision === "ignore_lower_priority") {
        stats.ignored += 1;
        continue;
      }

      if (match.decision === "flag_conflict") {
        stats.conflicts += 1;
        continue;
      }
    } catch (err) {
      logger.error("AccountingSync family sync error", {
        userId: params.userId,
        provider: params.provider,
        family: params.family,
        externalId: external.externalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return stats;
}

export class AccountingSyncService {
  static async syncAccounting(
    userId: string,
    provider: AccountingSource
  ): Promise<SyncResult> {
    if (!isSupportedSyncProvider(provider)) {
      throw new HttpError(
        400,
        `Unsupported accounting sync provider: ${String(provider)}`
      );
    }

    try {
      const connector = await buildConnector(userId, provider);
      const lastCursor = await getLastCursor(userId, provider);
      const syncStartedAt = new Date().toISOString();

      const contacts = connector.listContacts
        ? await connector.listContacts(lastCursor ?? undefined)
        : [];
      const salesInvoicesRaw = connector.listSalesInvoices
        ? await connector.listSalesInvoices(lastCursor ?? undefined)
        : [];
      const purchaseBillsRaw = connector.listPurchaseBills
        ? await connector.listPurchaseBills(lastCursor ?? undefined)
        : [];
      const payments = connector.listPayments
        ? await connector.listPayments(lastCursor ?? undefined)
        : [];

      const salesInvoices = normalizeExternalItems(
        salesInvoicesRaw.map((item) => toSyncCandidate(item, "sale"))
      );
      const purchaseBills = normalizeExternalItems(
        purchaseBillsRaw.map((item) => toSyncCandidate(item, "purchase"))
      );

      logger.info("AccountingSync fetched external documents", {
        userId,
        provider,
        lastCursor,
        contactsCount: contacts.length,
        salesInvoicesCount: salesInvoices.length,
        purchaseBillsCount: purchaseBills.length,
        paymentsCount: payments.length,
        salesExternalIds: salesInvoices.map((item) => item.externalId),
        purchaseExternalIds: purchaseBills.map((item) => item.externalId),
      });

      if (contacts.length > 0) {
        await syncContacts({
          userId,
          provider,
          contacts,
        });
      }

      const salesStats = await syncInvoiceFamily({
        userId,
        provider,
        family: "sale",
        externalItems: salesInvoices,
      });

      const purchaseStats = await syncInvoiceFamily({
        userId,
        provider,
        family: "purchase",
        externalItems: purchaseBills,
      });

      if (payments.length > 0) {
        await syncPayments({
          userId,
          provider,
          payments,
        });
      }

      const stats = mergeSyncResults(salesStats, purchaseStats);

      logger.info("AccountingSync finished processing documents", {
        userId,
        provider,
        created: stats.created,
        linked: stats.linked,
        upgraded: stats.upgraded,
        ignored: stats.ignored,
        conflicts: stats.conflicts,
      });

      await markSyncSuccess(userId, provider, syncStartedAt);

      await insertSyncEvent({
        userId,
        provider,
        status: "success",
        message: `Accounting sync completed (created: ${stats.created}, linked: ${stats.linked}, upgraded: ${stats.upgraded}, ignored: ${stats.ignored}, conflicts: ${stats.conflicts})`,
      });

      return stats;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Accounting sync failed";

      await markSyncError(userId, provider, message);

      await insertSyncEvent({
        userId,
        provider,
        status: "error",
        message,
      });

      throw error;
    }
  }

  static async syncInvoices(
    userId: string,
    provider: AccountingSource
  ): Promise<SyncResult> {
    return await this.syncAccounting(userId, provider);
  }
}