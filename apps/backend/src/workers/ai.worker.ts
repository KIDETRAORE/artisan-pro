// apps/backend/src/workers/ai.worker.ts
import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { redisOptions } from "../config/redis";
import { runAI, type AIType } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";

// ✅ Canonical compta schema (source of truth)
import { ComptaReportSchema } from "../utils/comptaReport.schema";

logger.info("👷 [WORKER-AI] Chargement du worker IA...");

const AITypeSchema = z.enum(["assistant", "devis", "compta", "vision", "relance", "vocal"]);

const JobPayloadSchema = z
  .object({
    type: AITypeSchema,
    userId: z.string().min(1),

    prompt: z.string().min(1).max(4000).optional(),

    fileBase64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    fileName: z.string().max(200).optional(),
  })
  .refine(
    (v) => {
      const hasPrompt = typeof v.prompt === "string" && v.prompt.trim().length > 0;
      const hasFile = typeof v.fileBase64 === "string" && typeof v.mimeType === "string";
      return hasPrompt || hasFile;
    },
    { message: "Missing prompt or file payload" }
  )
  .refine(
    (v) => {
      const a = !!v.fileBase64;
      const b = !!v.mimeType;
      return a === b;
    },
    { message: "fileBase64/mimeType must be provided together" }
  );

type JobPayload = z.infer<typeof JobPayloadSchema>;

const MAX_PREVIEW_ROWS = 200;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), ms);
    }),
  ]).finally(() => timer && clearTimeout(timer));
}

function maxBase64CharsFor(type: JobPayload["type"]): number {
  if (type === "compta") return 6_000_000;
  if (type === "vision") return 7_000_000;
  if (type === "vocal") return 11_000_000;
  return 4_000_000;
}

/**
 * Best-effort JSON parsing:
 * - strips code fences
 * - extracts first JSON object/array candidate
 */
function safeParseJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const candidate = match ? match[0] : cleaned;
  return JSON.parse(candidate);
}

/**
 * Enforce compta output strictly matches our Zod schema.
 * If invalid -> throw a clean error.
 */
function validateComptaOrThrow(maybe: unknown) {
  const parsed = ComptaReportSchema.safeParse(maybe);
  if (!parsed.success) {
    logger.warn("⚠️ [WORKER-AI] Compta JSON invalide (schema)", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    throw new Error("AI_SCHEMA_INVALID_COMPTA");
  }
  return parsed.data;
}

/**
 * Guarantee preview size server-side:
 * - truncate rows to MAX_PREVIEW_ROWS
 * - set truncated: true if trimmed
 */
function truncateComptaPreview(report: any): any {
  if (!report?.data?.sheets || typeof report.data.sheets !== "object") return report;

  const sheets = report.data.sheets as Record<
    string,
    { columns?: unknown; rows?: unknown; truncated?: unknown }
  >;

  for (const [name, table] of Object.entries(sheets)) {
    if (!table || typeof table !== "object") continue;

    const rows = (table as any).rows;

    if (Array.isArray(rows) && rows.length > MAX_PREVIEW_ROWS) {
      (table as any).rows = rows.slice(0, MAX_PREVIEW_ROWS);
      (table as any).truncated = true;

      logger.info("✂️ [WORKER-AI] Preview tronquée", {
        sheet: name,
        originalRows: rows.length,
        keptRows: MAX_PREVIEW_ROWS,
      });
    }
  }

  return report;
}

export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    if (job.name !== "ai-task") return;

    logger.info("🔥 [WORKER-AI] Job reçu", { id: job.id, name: job.name });

    const parsedPayload = JobPayloadSchema.safeParse(job.data);
    if (!parsedPayload.success) {
      logger.warn("⚠️ [WORKER-AI] Payload invalide", {
        jobId: job.id,
        issues: parsedPayload.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      throw new Error("AI_JOB_PAYLOAD_INVALID");
    }

    const payload: JobPayload = parsedPayload.data;

    if (payload.fileBase64) {
      const maxChars = maxBase64CharsFor(payload.type);
      if (payload.fileBase64.length > maxChars) {
        logger.warn("⚠️ [WORKER-AI] Payload trop gros", {
          jobId: job.id,
          type: payload.type,
          sizeChars: payload.fileBase64.length,
          maxChars,
        });
        throw new Error("AI_JOB_PAYLOAD_TOO_LARGE");
      }
    }

    const type = payload.type as AIType;

    const textResult = await withTimeout(
      runAI(type, {
        userId: payload.userId,
        prompt: payload.prompt,
        fileBase64: payload.fileBase64,
        mimeType: payload.mimeType,
      }),
      60_000,
      "runAI"
    );

    let result: unknown = textResult;

    if (typeof textResult === "string") {
      try {
        result = safeParseJson(textResult);
      } catch {
        result = textResult;
      }
    }

    // ✅ enforce compta schema strictly
    if (payload.type === "compta") {
      if (typeof result === "string") {
        logger.warn("⚠️ [WORKER-AI] Compta: résultat non JSON");
        throw new Error("AI_SCHEMA_INVALID_COMPTA");
      }

      // validate schema
      result = validateComptaOrThrow(result);

      // guarantee preview size
      result = truncateComptaPreview(result);
    }

    // ✅ meta minimale côté backend (utile UI + export)
    if (result && typeof result === "object" && payload.fileName) {
      const obj = result as any;
      obj.meta = {
        ...(obj.meta ?? {}),
        sourceFileName: payload.fileName,
      };
    }

    logger.info("✨ [WORKER-AI] Analyse réussie", {
      jobId: job.id,
      type: payload.type,
      userId: payload.userId,
    });

    return result;
  },
  { connection: redisOptions, concurrency: 2 }
);

aiWorker.on("completed", (job) => logger.info("✅ [WORKER-AI] Job terminé", { jobId: job.id }));
aiWorker.on("failed", (job, err) =>
  logger.error("❌ [WORKER-AI] Job échoué", {
    jobId: job?.id,
    message: err?.message ?? String(err),
  })
);