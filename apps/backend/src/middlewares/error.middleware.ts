// apps/backend/src/middlewares/error.middleware.ts
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { ENV } from "../config/env";
import { QuotaError } from "../services/quota/consumeQuota";

type ErrorBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId?: string;
  details?: unknown;
};

/**
 * Middleware global de gestion des erreurs (TS strict)
 * ✅ pas de stack exposée au client
 * ✅ pas de logs sensibles (pas de body/headers/cookies/tokens)
 * ✅ gère HttpError + ZodError + Multer + QuotaError + erreurs inconnues
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId =
    (req.headers["x-request-id"] as string | undefined) ??
    (req as any).requestId ??
    undefined;

  const baseLog = {
    requestId,
    path: req.path,
    method: req.method,
  };

  const send = (status: number, body: ErrorBody) => res.status(status).json(body);

  /* ================================
     1) ZOD (VALIDATION)
  ================================== */
  if (err instanceof ZodError) {
    logger.warn("Validation error", {
      ...baseLog,
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    });

    return send(400, {
      success: false,
      error: {
        code: "validation_error",
        message: "Erreur de validation",
      },
      requestId,
      details: err.issues.map((e) => ({
        field: e.path.length ? e.path.join(".") : "body",
        message: e.message,
      })),
    });
  }

  /* ================================
     2) MULTER (UPLOAD)
  ================================== */
  // Sans importer multer: on détecte via shape standard
  if (
    typeof err === "object" &&
    err !== null &&
    (err as any).name === "MulterError"
  ) {
    const code = String((err as any).code ?? "multer_error");

    // LIMIT_FILE_SIZE => 413
    const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;

    logger.warn("Upload error", { ...baseLog, code });

    return send(status, {
      success: false,
      error: {
        code: "upload_error",
        message:
          code === "LIMIT_FILE_SIZE"
            ? "Fichier trop volumineux."
            : "Erreur lors de l'upload.",
      },
      requestId,
      details: { code },
    });
  }

  /* ================================
     3) QUOTA (ATOMIC RPC)
  ================================== */
  if (err instanceof QuotaError) {
    const status = err.code === "quota_exceeded" ? 403 : 500;

    logger.warn("Quota error", {
      ...baseLog,
      code: err.code,
    });

    return send(status, {
      success: false,
      error: {
        code: err.code,
        message:
          err.code === "quota_exceeded"
            ? "Quota insuffisant. Passez au plan PRO."
            : "Erreur quota.",
      },
      requestId,
      // pas de données sensibles; meta ne contient que used/limit/reset_at
      details: err.meta ?? undefined,
    });
  }

  /* ================================
     4) HTTP ERROR (MÉTIER)
  ================================== */
  if (err instanceof HttpError) {
    logger.error("HttpError", {
      ...baseLog,
      status: err.statusCode,
      code: (err as any).code ?? "http_error",
      message: err.message,
    });

    return send(err.statusCode, {
      success: false,
      error: {
        code: (err as any).code ?? "http_error",
        message: err.message,
      },
      requestId,
    });
  }

  /* ================================
     5) STRIPE SIGNATURE (si remonte ici)
  ================================== */
  if (err instanceof Error) {
    const msg = err.message ?? "";
    const looksLikeStripeSig =
      /stripe/i.test(msg) && (/signature/i.test(msg) || /Webhook Error/i.test(msg));

    if (looksLikeStripeSig) {
      logger.warn("Stripe webhook signature error", {
        ...baseLog,
        message: msg,
      });

      return send(400, {
        success: false,
        error: {
          code: "stripe_webhook_invalid_signature",
          message: "Signature Stripe invalide.",
        },
        requestId,
      });
    }
  }

  /* ================================
     6) ERREURS INCONNUES
  ================================== */
  if (err instanceof Error) {
    logger.error("Unhandled error", {
      ...baseLog,
      name: err.name,
      message: err.message,
      // stack uniquement côté serveur, jamais dans la réponse
      stack: ENV.NODE_ENV !== "production" ? err.stack : undefined,
    });
  } else {
    logger.error("Unhandled non-Error thrown", {
      ...baseLog,
      detail: err,
    });
  }

  return send(500, {
    success: false,
    error: {
      code: "internal_error",
      message: "Erreur interne du serveur",
    },
    requestId,
  });
}