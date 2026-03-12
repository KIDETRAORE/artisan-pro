// apps/backend/src/workers/integration.worker.ts
import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";
import { SalesInvoicesService } from "../services/salesInvoices.service";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  PennylaneConnector,
  type ArtisanProInvoiceLine,
} from "../integrations/providers/pennylane/pennylane.connector";
import { IntegrationsService } from "../services/integrations.service";
import type { IntegrationJobPayload } from "../queues/integration.queue";

const ProviderSchema = z
  .string()
  .min(1)
  .transform((s) => s.toLowerCase());

const PushInvoiceJobSchema = z.object({
  type: z.literal("push_invoice"),
  userId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  provider: ProviderSchema,
});

type PushInvoiceJob = z.infer<typeof PushInvoiceJobSchema>;

function parseJobData(data: unknown): PushInvoiceJob {
  const parsed = PushInvoiceJobSchema.safeParse(data);
  if (!parsed.success) {
    logger.warn("⚠️ [WORKER-INTEGRATION] Invalid job payload", {
      issues: parsed.error.issues,
    });
    throw new Error("invalid_job_payload");
  }
  return parsed.data;
}

const providerCircuitState: Record<
  string,
  { failures: number; openedAt: number | null }
> = {};

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_TIMEOUT_MS = 60000;

function isCircuitOpen(provider: string): boolean {
  const state = providerCircuitState[provider];
  if (!state || state.openedAt === null) return false;

  const now = Date.now();

  if (now - state.openedAt > CIRCUIT_RESET_TIMEOUT_MS) {
    providerCircuitState[provider] = { failures: 0, openedAt: null };
    return false;
  }

  return true;
}

function recordFailure(provider: string) {
  const state = providerCircuitState[provider] ?? {
    failures: 0,
    openedAt: null,
  };

  state.failures += 1;

  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.openedAt = Date.now();
    logger.warn("🚨 [WORKER-INTEGRATION] Circuit breaker opened", {
      provider,
    });
  }

  providerCircuitState[provider] = state;
}

function recordSuccess(provider: string) {
  providerCircuitState[provider] = { failures: 0, openedAt: null };
}

function toPennylaneInvoiceStatus(status: string | null | undefined): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : "draft";
}

async function upsertExternalIdMap(params: {
  provider: string;
  objectType: "invoice";
  externalId: string;
  internalId: string;
}) {
  const { error } = await supabaseAdmin.from("external_id_map").upsert(
    {
      provider: params.provider,
      object_type: params.objectType,
      external_id: params.externalId,
      internal_id: params.internalId,
    },
    { onConflict: "provider,object_type,internal_id" }
  );

  if (error) {
    logger.warn("⚠️ [WORKER-INTEGRATION] external_id_map upsert failed", {
      provider: params.provider,
      objectType: params.objectType,
      externalId: params.externalId,
      internalId: params.internalId,
      message: error.message,
    });
  }
}

async function findExistingExternalId(params: {
  provider: string;
  objectType: "invoice";
  internalId: string;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("external_id_map")
    .select("external_id")
    .eq("provider", params.provider)
    .eq("object_type", params.objectType)
    .eq("internal_id", params.internalId)
    .maybeSingle();

  if (error) {
    logger.warn("⚠️ [WORKER-INTEGRATION] external_id_map lookup failed", {
      provider: params.provider,
      objectType: params.objectType,
      internalId: params.internalId,
      message: error.message,
    });
    return null;
  }

  if (!data) return null;

  const externalId = String(
    (data as { external_id?: string }).external_id ?? ""
  );
  return externalId.length > 0 ? externalId : null;
}

async function loadInvoiceLines(
  invoiceId: string
): Promise<ArtisanProInvoiceLine[]> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select(
      "id, description, quantity, unit_price_cents, tax_rate, line_total_cents"
    )
    .eq("invoice_id", invoiceId)
    .eq("type", "sale")
    .order("created_at", { ascending: true });

  if (error) {
    logger.warn("⚠️ [WORKER-INTEGRATION] invoice_lines load failed", {
      invoiceId,
      message: error.message,
    });
    return [];
  }

  return (data ?? []) as ArtisanProInvoiceLine[];
}

async function loadInvoiceContact(params: {
  userId: string;
  contactId: string | null;
}): Promise<{ name: string; email: string | null }> {
  if (!params.contactId) {
    return { name: "Client", email: null };
  }

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email")
    .eq("id", params.contactId)
    .eq("user_id", params.userId)
    .maybeSingle();

  if (error) {
    logger.warn("⚠️ [WORKER-INTEGRATION] contact lookup failed", {
      userId: params.userId,
      contactId: params.contactId,
      message: error.message,
    });
    return { name: "Client", email: null };
  }

  return {
    name:
      typeof data?.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : "Client",
    email:
      typeof data?.email === "string" && data.email.trim().length > 0
        ? data.email.trim()
        : null,
  };
}

function isSentStatus(status: unknown): boolean {
  const normalized = String(status ?? "").toLowerCase().trim();
  return normalized === "sent" || normalized === "overdue";
}

function isStubExternalId(externalId: string): boolean {
  return externalId.startsWith("pennylane_stub_");
}

async function logSyncEvent(params: {
  userId: string;
  provider: string;
  objectType: string;
  objectId: string;
  status: "success" | "error";
  message?: string;
  details?: unknown;
}) {
  try {
    await supabaseAdmin.from("sync_events").insert({
      user_id: params.userId,
      provider: params.provider,
      object_type: params.objectType,
      object_id: params.objectId,
      status: params.status,
      message: params.message ?? null,
      details: params.details ?? null,
    });
  } catch (err) {
    logger.warn("⚠️ [WORKER-INTEGRATION] sync_events insert failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export const integrationWorker = new Worker<IntegrationJobPayload>(
  "integrationQueue",
  async (job: Job<IntegrationJobPayload>) => {
    const payload = parseJobData(job.data);

    logger.info("🔁 [WORKER-INTEGRATION] Job start", {
      jobId: job.id,
      type: payload.type,
      provider: payload.provider,
      invoiceId: payload.invoiceId,
      userId: payload.userId,
    });

    if (payload.type === "push_invoice") {
      const invoice = await SalesInvoicesService.getSalesInvoice(
        payload.userId,
        payload.invoiceId
      );

      logger.info("📦 [WORKER-INTEGRATION] Sales invoice loaded", {
        jobId: job.id,
        provider: payload.provider,
        invoiceId: invoice.id,
        status: invoice.status,
        total_cents: invoice.total_cents,
        due_date: invoice.due_date,
      });

      if (payload.provider === "pennylane") {
        if (isCircuitOpen("pennylane")) {
          logger.warn("⛔ [WORKER-INTEGRATION] Circuit open, skipping job", {
            invoiceId: invoice.id,
          });

          await IntegrationsService.markPennylaneSyncError(
            payload.userId,
            "circuit_open"
          );

          throw new Error("circuit_open");
        }

        if (!isSentStatus(invoice.status)) {
          logger.info("⏭️ [WORKER-INTEGRATION] Skip invoice not sent", {
            jobId: job.id,
            invoiceId: invoice.id,
            status: invoice.status,
          });

          return {
            ok: true,
            provider: "pennylane",
            invoiceId: invoice.id,
            skipped: true,
            reason: "not_sent",
          };
        }

        const lines = await loadInvoiceLines(invoice.id);

        if (lines.length === 0) {
          logger.info("⏭️ [WORKER-INTEGRATION] Skip invoice without lines", {
            jobId: job.id,
            invoiceId: invoice.id,
          });

          await logSyncEvent({
            userId: payload.userId,
            provider: "pennylane",
            objectType: "invoice",
            objectId: invoice.id,
            status: "error",
            message: "invoice_without_lines",
          });

          await IntegrationsService.markPennylaneSyncError(
            payload.userId,
            "invoice_without_lines"
          );

          throw new Error("invoice_without_lines");
        }

        const contact = await loadInvoiceContact({
          userId: payload.userId,
          contactId: invoice.contact_id,
        });

        const totalAmount =
          typeof invoice.total_cents === "number" ? invoice.total_cents / 100 : 0;

        const normalizedStatus = toPennylaneInvoiceStatus(invoice.status);

        try {
          const existingExternalId = await findExistingExternalId({
            provider: "pennylane",
            objectType: "invoice",
            internalId: invoice.id,
          });

          if (existingExternalId) {
            const updated = await PennylaneConnector.updateInvoice(
              existingExternalId,
              {
                id: invoice.id,
                client_name: contact.name,
                client_email: contact.email,
                total_amount: totalAmount,
                due_date: invoice.due_date ?? "",
                status: normalizedStatus,
                lines,
              }
            );

            recordSuccess("pennylane");
            await IntegrationsService.markPennylaneSyncSuccess(payload.userId);

            logger.info(
              "🔄 [WORKER-INTEGRATION] Pennylane updateInvoice success",
              {
                jobId: job.id,
                invoiceId: invoice.id,
                externalId: updated.externalId,
              }
            );

            if (!isStubExternalId(updated.externalId)) {
              await upsertExternalIdMap({
                provider: "pennylane",
                objectType: "invoice",
                externalId: updated.externalId,
                internalId: invoice.id,
              });
            }

            await logSyncEvent({
              userId: payload.userId,
              provider: "pennylane",
              objectType: "invoice",
              objectId: invoice.id,
              status: "success",
              message: "invoice updated",
            });

            return {
              ok: true,
              provider: "pennylane",
              invoiceId: invoice.id,
              externalId: updated.externalId,
              updated: true,
            };
          }

          const result = await PennylaneConnector.pushInvoice({
            id: invoice.id,
            client_name: contact.name,
            client_email: contact.email,
            total_amount: totalAmount,
            due_date: invoice.due_date ?? "",
            status: normalizedStatus,
            lines,
          });

          recordSuccess("pennylane");
          await IntegrationsService.markPennylaneSyncSuccess(payload.userId);

          logger.info("✅ [WORKER-INTEGRATION] Pennylane pushInvoice success", {
            jobId: job.id,
            invoiceId: invoice.id,
            externalId: result.externalId,
          });

          if (!isStubExternalId(result.externalId)) {
            await upsertExternalIdMap({
              provider: "pennylane",
              objectType: "invoice",
              externalId: result.externalId,
              internalId: invoice.id,
            });
          } else {
            logger.info(
              "🧪 [WORKER-INTEGRATION] Skip external_id_map upsert (stub)",
              {
                jobId: job.id,
                invoiceId: invoice.id,
                externalId: result.externalId,
              }
            );
          }

          await logSyncEvent({
            userId: payload.userId,
            provider: "pennylane",
            objectType: "invoice",
            objectId: invoice.id,
            status: "success",
            message: "invoice pushed",
          });

          return {
            ok: true,
            provider: "pennylane",
            invoiceId: invoice.id,
            externalId: result.externalId,
          };
        } catch (err) {
          recordFailure("pennylane");

          const errorMessage =
            err instanceof Error ? err.message : "unknown_error";

          await IntegrationsService.markPennylaneSyncError(
            payload.userId,
            errorMessage
          );

          await logSyncEvent({
            userId: payload.userId,
            provider: "pennylane",
            objectType: "invoice",
            objectId: invoice.id,
            status: "error",
            message: errorMessage,
          });

          throw err;
        }
      }

      logger.warn("⚠️ [WORKER-INTEGRATION] Unsupported provider", {
        jobId: job.id,
        provider: payload.provider,
      });

      return {
        ok: false,
        reason: "unsupported_provider",
        provider: payload.provider,
        invoiceId: invoice.id,
      };
    }

    throw new Error("unknown_job_type");
  },
  {
    connection: redisOptions,
  }
);

logger.info("👷 [WORKER-INTEGRATION] Worker loaded");