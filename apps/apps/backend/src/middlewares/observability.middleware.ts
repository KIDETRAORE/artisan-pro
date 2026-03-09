import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";

type AuthedRequest = Request & {
  user?: { id?: string };
  requestId?: string;
  _startAtMs?: number;
};

/**
 * Minimal observability:
 * - requestId per request
 * - duration timer
 * - X-Request-Id response header
 * - structured HTTP log (requestId, userId, duration, status)
 */
export function observabilityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const r = req as AuthedRequest;

  // Request ID (accept incoming if present)
  const incoming = req.header("x-request-id") ?? undefined;
  r.requestId = incoming && typeof incoming === "string" ? incoming : randomUUID();

  // Start timer
  r._startAtMs = Date.now();

  // Always expose request id on responses
  res.setHeader("X-Request-Id", r.requestId);

  // Log on response finish
  res.on("finish", () => {
    const durationMs =
      typeof r._startAtMs === "number" ? Date.now() - r._startAtMs : undefined;

    const userId = r.user?.id;

    const meta = {
      requestId: r.requestId,
      userId: userId ?? null,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: durationMs ?? null,
    };

    if (res.statusCode >= 500) logger.error("HTTP request", meta);
    else if (res.statusCode >= 400) logger.warn("HTTP request", meta);
    else logger.info("HTTP request", meta);
  });

  next();
}