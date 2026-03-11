// apps/backend/src/routes/payments.routes.ts

import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "@middlewares/auth.middleware";
import { PaymentsService } from "../services/payments.service";
import { HttpError } from "../utils/httpError";

const router = Router();

const PaymentIdParamsSchema = z.object({
  paymentId: z.string().uuid(),
});

const CreatePaymentBodySchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  sales_invoice_id: z.string().uuid().nullable().optional(),
  purchase_bill_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  payment_date: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["pending", "processing", "paid", "failed", "cancelled", "refunded"])
    .default("pending"),
  direction: z.enum(["inbound", "outbound"]),
  reference: z.string().trim().min(1).nullable().optional(),
  source_system: z
    .enum(["artisanpro", "pennylane", "odoo", "file_import", "manual"])
    .nullable()
    .optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: z
    .enum(["manual", "artisanpro", "compta_import", "sync"])
    .default("manual"),
});

const UpdatePaymentBodySchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  sales_invoice_id: z.string().uuid().nullable().optional(),
  purchase_bill_id: z.string().uuid().nullable().optional(),
  amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  payment_date: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["pending", "processing", "paid", "failed", "cancelled", "refunded"])
    .optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  reference: z.string().trim().min(1).nullable().optional(),
  source_system: z
    .enum(["artisanpro", "pennylane", "odoo", "file_import", "manual"])
    .nullable()
    .optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: z
    .enum(["manual", "artisanpro", "compta_import", "sync"])
    .optional(),
});

function getUserId(req: {
  user?: {
    id?: string;
  };
}): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  return userId;
}

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);

    const items = await PaymentsService.listPayments(userId);

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:paymentId", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { paymentId } = PaymentIdParamsSchema.parse(req.params);

    const item = await PaymentsService.getPayment(userId, paymentId);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = CreatePaymentBodySchema.parse(req.body);

    const item = await PaymentsService.createPayment(userId, body);

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:paymentId", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { paymentId } = PaymentIdParamsSchema.parse(req.params);
    const body = UpdatePaymentBodySchema.parse(req.body);

    const item = await PaymentsService.updatePayment(userId, paymentId, body);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

export default router;