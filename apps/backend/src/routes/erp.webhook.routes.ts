// apps/backend/src/routes/erp.webhook.routes.ts
import { Router } from "express";
import { asyncHandler } from "@utils/asyncHandler";
import { HttpError } from "../utils/httpError";
import { enqueueAccountingSyncJob } from "../queues/accountingSync.queue";
import { ENV } from "../config/env";

const router = Router();

function assertWebhookSecret(
  receivedSecret: string | string[] | undefined
): void {
  const expected = String((ENV as any).ERP_WEBHOOK_SECRET ?? "").trim();

  if (!expected) {
    return;
  }

  const received = Array.isArray(receivedSecret)
    ? String(receivedSecret[0] ?? "").trim()
    : String(receivedSecret ?? "").trim();

  if (!received || received !== expected) {
    throw new HttpError(401, "Invalid ERP webhook secret");
  }
}

function getUserId(body: unknown): string {
  const userId = String((body as any)?.userId ?? "").trim();

  if (!userId) {
    throw new HttpError(400, "Missing userId");
  }

  return userId;
}

router.post(
  "/pennylane",
  asyncHandler(async (req, res) => {
    assertWebhookSecret(req.headers["x-artisanpro-webhook-secret"]);

    const userId = getUserId(req.body);

    await enqueueAccountingSyncJob({
      userId,
      provider: "pennylane",
    });

    return res.status(202).json({
      success: true,
      provider: "pennylane",
      message: "Webhook sync job enqueued",
    });
  })
);

router.post(
  "/odoo",
  asyncHandler(async (req, res) => {
    assertWebhookSecret(req.headers["x-artisanpro-webhook-secret"]);

    const userId = getUserId(req.body);

    await enqueueAccountingSyncJob({
      userId,
      provider: "odoo",
    });

    return res.status(202).json({
      success: true,
      provider: "odoo",
      message: "Webhook sync job enqueued",
    });
  })
);

export default router;