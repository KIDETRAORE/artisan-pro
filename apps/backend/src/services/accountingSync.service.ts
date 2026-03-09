// apps/backend/src/services/accountingSync.service.ts

import { AccountingConnectorFactory } from "./accountingConnector.factory";
import {
  AccountingMatchingService,
  type AccountingSource,
} from "./accountingMatching.service";
import { InvoicesService } from "./invoices.service";
import { IntegrationsService } from "./integrations.service";
import { ExternalIdMapService } from "./externalIdMap.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

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

      const externalInvoices = await connector.listInvoices(lastCursor ?? undefined);

      for (const external of externalInvoices) {
        try {
          const match =
            await AccountingMatchingService.matchInvoiceCandidate(userId, {
              sourceSystem: provider,
              sourceExternalId: external.externalId,
              invoiceNumber: external.invoiceNumber,
              clientName: external.clientName,
              issueDate: external.issueDate,
              dueDate: external.dueDate,
              totalAmountCents: external.totalAmountCents,
            });

          if (match.decision === "create_new") {
            const createdInvoice = await InvoicesService.createInvoice(userId, {
              client_name: external.clientName ?? "Client",
              client_email: null,
              total_amount: (external.totalAmountCents ?? 0) / 100,
              due_date: external.dueDate ?? new Date().toISOString(),
              status: "sent",
              origin_type: "compta_import",
              source_system: provider,
              source_external_id: external.externalId,
              invoice_number: external.invoiceNumber,
            });

            await ExternalIdMapService.upsertExternalMapping({
              userId,
              sourceSystem: provider,
              externalEntityType: "invoice",
              externalId: external.externalId,
              internalEntityType: "invoice",
              internalId: createdInvoice.id,
              matchConfidence: "exact",
            });

            stats.created++;
            continue;
          }

          if (match.decision === "link_existing" && match.matchedInvoiceId) {
            await ExternalIdMapService.upsertExternalMapping({
              userId,
              sourceSystem: provider,
              externalEntityType: "invoice",
              externalId: external.externalId,
              internalEntityType: "invoice",
              internalId: match.matchedInvoiceId,
              matchConfidence:
                match.confidence === "manual_required"
                  ? "manual"
                  : match.confidence,
            });

            stats.linked++;
            continue;
          }

          if (match.decision === "upgrade_source" && match.matchedInvoiceId) {
            const { error } = await supabaseAdmin
              .from("invoices")
              .update({
                origin_type: "compta_import",
                source_system: provider,
                source_external_id: external.externalId,
              })
              .eq("id", match.matchedInvoiceId)
              .eq("user_id", userId);

            if (error) {
              throw new HttpError(500, "Failed to upgrade invoice source");
            }

            await ExternalIdMapService.upsertExternalMapping({
              userId,
              sourceSystem: provider,
              externalEntityType: "invoice",
              externalId: external.externalId,
              internalEntityType: "invoice",
              internalId: match.matchedInvoiceId,
              matchConfidence:
                match.confidence === "manual_required"
                  ? "manual"
                  : match.confidence,
            });

            stats.upgraded++;
            continue;
          }

          if (match.decision === "ignore_lower_priority") {
            stats.ignored++;
            continue;
          }

          if (match.decision === "flag_conflict") {
            stats.conflicts++;

            logger.warn("AccountingSync conflict detected", {
              userId,
              provider,
              externalId: external.externalId,
              reason: match.reason,
            });

            continue;
          }
        } catch (err) {
          logger.error("AccountingSync invoice sync error", {
            userId,
            provider,
            externalId: external.externalId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await markSyncSuccess(userId, provider, syncStartedAt);

      return stats;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Accounting sync failed";

      await markSyncError(userId, provider, message);

      throw error;
    }
  }
}