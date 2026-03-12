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
import { type ExternalInvoice } from "./connectors/accountingConnector.types";

type SupportedSyncProvider = Extract<AccountingSource, "pennylane" | "odoo">;

type SyncResult = {
  created: number;
  linked: number;
  upgraded: number;
  ignored: number;
  conflicts: number;
};

function isSupportedSyncProvider(
  provider: AccountingSource
): provider is SupportedSyncProvider {
  return provider === "pennylane" || provider === "odoo";
}

function getExternalContactType(
  external: ExternalInvoice
): "client" | "supplier" {
  return external.type === "purchase" ? "supplier" : "client";
}

function getExternalDisplayName(external: ExternalInvoice): string {
  if (
    typeof external.clientName === "string" &&
    external.clientName.trim().length > 0
  ) {
    return external.clientName.trim();
  }

  return external.type === "purchase" ? "Supplier" : "Client";
}

function getExternalAmountCents(external: ExternalInvoice): number | null {
  if (
    typeof external.totalAmountCents === "number" &&
    Number.isFinite(external.totalAmountCents)
  ) {
    return Math.round(external.totalAmountCents);
  }

  return null;
}

async function buildConnector(
  userId: string,
  provider: SupportedSyncProvider
) {
  if (provider === "pennylane") {
    const apiToken = await IntegrationsService.getPennylaneApiKey(userId);

    if (!apiToken) {
      throw new HttpError(400, "Pennylane is not configured");
    }

    return AccountingConnectorFactory.create({
      provider: "pennylane",
      config: {
        apiToken,
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

async function createCanonicalInvoice(params: {
  userId: string;
  provider: SupportedSyncProvider;
  external: ExternalInvoice;
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
  external: ExternalInvoice;
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
  external: ExternalInvoice;
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

export class AccountingSyncService {
  static async syncInvoices(
    userId: string,
    provider: AccountingSource
  ): Promise<SyncResult> {
    if (!isSupportedSyncProvider(provider)) {
      throw new HttpError(
        400,
        `Unsupported accounting sync provider: ${String(provider)}`
      );
    }

    const stats: SyncResult = {
      created: 0,
      linked: 0,
      upgraded: 0,
      ignored: 0,
      conflicts: 0,
    };

    try {
      const connector = await buildConnector(userId, provider);
      const lastCursor = await getLastCursor(userId, provider);
      const syncStartedAt = new Date().toISOString();

      const externalInvoices = await connector.listInvoices(
        lastCursor ?? undefined
      );

      logger.info("AccountingSync fetched external invoices", {
        userId,
        provider,
        lastCursor,
        count: externalInvoices.length,
        externalIds: externalInvoices.map((invoice) => invoice.externalId),
      });

      for (const external of externalInvoices) {
        try {
          const contactType = getExternalContactType(external);
          const displayName = getExternalDisplayName(external);

          logger.info("AccountingSync processing external invoice", {
            userId,
            provider,
            externalId: external.externalId,
            invoiceType: external.type,
            invoiceNumber: external.invoiceNumber,
            clientName: external.clientName,
            issueDate: external.issueDate,
            dueDate: external.dueDate,
            totalAmountCents: external.totalAmountCents,
            status: external.status ?? null,
          });

          const match =
            await AccountingMatchingService.matchInvoiceCandidate(userId, {
              type: external.type,
              sourceSystem: provider,
              sourceExternalId: external.externalId,
              invoiceNumber: external.invoiceNumber,
              clientName: external.clientName,
              issueDate: external.issueDate,
              dueDate: external.dueDate,
              totalAmountCents: external.totalAmountCents,
            });

          logger.info("AccountingSync invoice match result", {
            userId,
            provider,
            externalId: external.externalId,
            invoiceType: external.type,
            decision: match.decision,
            confidence: match.confidence,
            matchedInvoiceId: match.matchedInvoiceId,
            matchedBy: match.matchedBy,
            reason: match.reason,
          });

          if (match.decision === "create_new") {
            logger.info("AccountingSync creating invoice from external invoice", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              invoiceNumber: external.invoiceNumber,
            });

            const contact = await ContactsService.findOrCreateContact({
              userId,
              sourceSystem: provider,
              input: {
                name: displayName,
                contact_type: contactType,
                email: null,
                source_system: provider,
                source_external_id: null,
              },
            });

            const createdInvoice = await createCanonicalInvoice({
              userId,
              provider,
              external,
              contactId: contact.id,
            });

            logger.info("AccountingSync created invoice from external invoice", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              invoiceId: createdInvoice.id,
            });

            await ExternalIdMapService.upsertExternalMapping({
              userId,
              sourceSystem: provider,
              externalEntityType: "invoice",
              externalId: external.externalId,
              internalId: createdInvoice.id,
            });

            logger.info("AccountingSync external mapping upserted", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              internalId: createdInvoice.id,
            });

            stats.created++;
            continue;
          }

          if (match.decision === "link_existing" && match.matchedInvoiceId) {
            const contact = await ContactsService.findOrCreateContact({
              userId,
              sourceSystem: provider,
              input: {
                name: displayName,
                contact_type: contactType,
                email: null,
                source_system: provider,
                source_external_id: null,
              },
            });

            await updateCanonicalInvoiceLink({
              userId,
              provider,
              external,
              internalId: match.matchedInvoiceId,
              contactId: contact.id,
            });

            await ExternalIdMapService.upsertExternalMapping({
              userId,
              sourceSystem: provider,
              externalEntityType: "invoice",
              externalId: external.externalId,
              internalId: match.matchedInvoiceId,
            });

            logger.info("AccountingSync linked existing invoice", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              matchedInvoiceId: match.matchedInvoiceId,
            });

            stats.linked++;
            continue;
          }

          if (match.decision === "upgrade_source" && match.matchedInvoiceId) {
            await upgradeCanonicalInvoiceSource({
              userId,
              provider,
              external,
              internalId: match.matchedInvoiceId,
            });

            await ExternalIdMapService.upsertExternalMapping({
              userId,
              sourceSystem: provider,
              externalEntityType: "invoice",
              externalId: external.externalId,
              internalId: match.matchedInvoiceId,
            });

            logger.info("AccountingSync upgraded invoice source", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              matchedInvoiceId: match.matchedInvoiceId,
            });

            stats.upgraded++;
            continue;
          }

          if (match.decision === "ignore_lower_priority") {
            logger.info("AccountingSync ignored lower priority invoice", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              reason: match.reason,
            });

            stats.ignored++;
            continue;
          }

          if (match.decision === "flag_conflict") {
            stats.conflicts++;

            logger.warn("AccountingSync conflict detected", {
              userId,
              provider,
              externalId: external.externalId,
              invoiceType: external.type,
              reason: match.reason,
            });

            continue;
          }
        } catch (err) {
          logger.error("AccountingSync invoice sync error", {
            userId,
            provider,
            externalId: external.externalId,
            invoiceType: external.type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info("AccountingSync finished processing invoices", {
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
}