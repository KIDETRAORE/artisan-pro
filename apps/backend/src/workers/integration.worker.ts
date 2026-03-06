// apps/backend/src/workers/integration.worker.ts
import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { redisOptions } from "../config/redis";
import { logger } from "../utils/logger";
import { InvoicesService } from "../services/invoices.service";

// ✅ AJOUTS
import { supabaseAdmin } from "../lib/supabaseAdmin";
import {
  PennylaneConnector,
  type ArtisanProInvoiceLine,
} from "../integrations/providers/pennylane/pennylane.connector";

/**
 * Worker d'intégration (Pennylane/Sage/EBP/etc.)
 * MVP Phase 1 : push invoice (ArtisanPro -> Pennylane)
 *
 * Jobs attendus:
 * - type: "push_invoice"
 *   data: { userId, invoiceId, provider }
 */

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

/**
 * ============================
 * CIRCUIT BREAKER (Pennylane)
 * ============================
 */

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

async function upsertExternalIdMap(params: {
  provider: string;
  objectType: "invoice";
  externalId: string;
  internalId: string;
}) {
  const { error } = await supabaseAdmin
    .from("external_id_map")
    .upsert(
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

  const externalId = String((data as any).external_id ?? "");
  return externalId.length > 0 ? externalId : null;
}

async function loadInvoiceLines(invoiceId: string): Promise<ArtisanProInvoiceLine[]> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id, description, quantity, unit_price_cents, tax_rate, line_total_cents")
    .eq("invoice_id", invoiceId)
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

function isSentStatus(status: unknown): boolean {
  return String(status ?? "")
    .toLowerCase()
    .trim() === "sent";
}

function isStubExternalId(externalId: string): boolean {
  return externalId.startsWith("pennylane_stub_");
}

// ✅ AJOUT : log dans sync_events
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

export const integrationWorker = new Worker(
  "integrationQueue",
  async (job: Job) => {
    const payload = parseJobData(job.data);

    logger.info("🔁 [WORKER-INTEGRATION] Job start", {
      jobId: job.id,
      type: payload.type,
      provider: payload.provider,
      invoiceId: payload.invoiceId,
      userId: payload.userId,
    });

    if (payload.type === "push_invoice") {
      const invoice = await InvoicesService.getInvoice(
        payload.userId,
        payload.invoiceId
      );

      logger.info("📦 [WORKER-INTEGRATION] Invoice loaded", {
        jobId: job.id,
        provider: payload.provider,
        invoiceId: invoice.id,
        status: invoice.status,
        total_amount: invoice.total_amount,
        due_date: invoice.due_date,
      });

      if (payload.provider === "pennylane") {

        // ✅ CIRCUIT BREAKER CHECK
        if (isCircuitOpen("pennylane")) {
          logger.warn("⛔ [WORKER-INTEGRATION] Circuit open, skipping job", {
            invoiceId: invoice.id,
          });
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

        const totalAmount =
          typeof invoice.total_amount === "number"
            ? invoice.total_amount
            : ((invoice as any).total_amount_cents ?? 0) / 100;

        const lines = await loadInvoiceLines(invoice.id);

        try {
          const existingExternalId = await findExistingExternalId({
            provider: "pennylane",
            objectType: "invoice",
            internalId: invoice.id,
          });

          if (existingExternalId) {
            const updated = await PennylaneConnector.updateInvoice(existingExternalId, {
              id: invoice.id,
              client_name: invoice.client_name,
              client_email: invoice.client_email,
              total_amount: totalAmount,
              due_date: invoice.due_date,
              status: invoice.status,
              lines,
            });

            recordSuccess("pennylane");

            logger.info("🔄 [WORKER-INTEGRATION] Pennylane updateInvoice success", {
              jobId: job.id,
              invoiceId: invoice.id,
              externalId: updated.externalId,
            });

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
            client_name: invoice.client_name,
            client_email: invoice.client_email,
            total_amount: totalAmount,
            due_date: invoice.due_date,
            status: invoice.status,
            lines,
          });

          recordSuccess("pennylane");

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
            logger.info("🧪 [WORKER-INTEGRATION] Skip external_id_map upsert (stub)", {
              jobId: job.id,
              invoiceId: invoice.id,
              externalId: result.externalId,
            });
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

          await logSyncEvent({
            userId: payload.userId,
            provider: "pennylane",
            objectType: "invoice",
            objectId: invoice.id,
            status: "error",
            message: err instanceof Error ? err.message : "unknown_error",
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