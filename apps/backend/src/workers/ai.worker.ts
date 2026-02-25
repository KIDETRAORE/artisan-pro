// apps/backend/src/workers/ai.worker.ts
import { Worker, type Job } from "bullmq";
import { z } from "zod";
import { redisOptions } from "../config/redis";
import { runAI, type AIType } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";

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
  if (type === "compta") return 6_000_000; // XLSX -> texte => peut être plus gros, mais déjà limité côté route
  if (type === "vision") return 7_000_000;
  if (type === "vocal") return 11_000_000;
  return 4_000_000;
}

function safeParseJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const candidate = match ? match[0] : cleaned;
  return JSON.parse(candidate);
}

export const aiWorker = new Worker(
  "aiQueue",
  async (job: Job) => {
    // ✅ important: éviter de traiter d'autres jobs accidentels
    if (job.name !== "ai-task") return;

    logger.info("🔥 [WORKER-AI] Job reçu", { id: job.id, name: job.name });

    const parsed = JobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      logger.warn("⚠️ [WORKER-AI] Payload invalide", {
        jobId: job.id,
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
      throw new Error("AI_JOB_PAYLOAD_INVALID");
    }

    const payload: JobPayload = parsed.data;

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

    let result: any = textResult;

    if (typeof textResult === "string") {
      try {
        result = safeParseJson(textResult);
      } catch {
        result = textResult;
      }
    }

    // ✅ meta minimale côté backend (utile UI + export)
    if (result && typeof result === "object" && payload.fileName) {
      result.meta = {
        ...(result.meta ?? {}),
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
  logger.error("❌ [WORKER-AI] Job échoué", { jobId: job?.id, message: err?.message ?? String(err) })
);